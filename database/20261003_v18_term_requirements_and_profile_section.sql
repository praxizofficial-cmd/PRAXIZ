begin;

-- Academic-term lifecycle: dates remain editable until an explicit finalization.
alter table public.academic_terms add column if not exists configuration_status text not null default 'draft';
alter table public.academic_terms add column if not exists finalized_at timestamptz;
alter table public.academic_terms add column if not exists finalized_by_user_id uuid references public.profiles(id) on update cascade on delete restrict;
alter table public.academic_terms drop constraint if exists academic_terms_configuration_status_check;
alter table public.academic_terms add constraint academic_terms_configuration_status_check
  check (configuration_status in ('draft', 'configured', 'finalized'));

update public.academic_terms
set configuration_status = case when is_current then 'configured' else configuration_status end
where configuration_status = 'draft' and deleted_at is null;

create or replace function public.create_academic_term(
  p_academic_year_id uuid,
  p_term text,
  p_starts_on date,
  p_ends_on date,
  p_is_current boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_term_id uuid;
begin
  if p_ends_on < p_starts_on then raise exception 'The end date must be on or after the start date'; end if;
  insert into public.academic_terms (academic_year_id, term, starts_on, ends_on, is_current, configuration_status)
  values (p_academic_year_id, p_term, p_starts_on, p_ends_on, false, case when p_is_current then 'configured' else 'draft' end)
  returning id into v_term_id;
  if p_is_current then perform public.set_current_academic_term(v_term_id); end if;
  return v_term_id;
end;
$function$;

revoke all on function public.create_academic_term(uuid,text,date,date,boolean) from public, anon;
grant execute on function public.create_academic_term(uuid,text,date,date,boolean) to authenticated;

create or replace function public.update_academic_term(
  p_term_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_is_current boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
begin
  if auth.uid() is null or not private.has_permission('users:manage', null) then
    raise exception 'Only an authorized administrator can update academic terms';
  end if;
  if p_ends_on < p_starts_on then raise exception 'The end date must be on or after the start date'; end if;
  select configuration_status into v_status from public.academic_terms
    where id = p_term_id and deleted_at is null for update;
  if v_status is null then raise exception 'Academic term not found'; end if;
  if v_status = 'finalized' then raise exception 'Finalized academic terms are read-only'; end if;
  update public.academic_terms set starts_on = p_starts_on, ends_on = p_ends_on,
    configuration_status = 'configured', updated_at = timezone('utc', now()) where id = p_term_id;
  if p_is_current then perform public.set_current_academic_term(p_term_id); end if;
end;
$function$;

create or replace function public.finalize_academic_term(p_term_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  if auth.uid() is null or not private.has_permission('users:manage', null) then
    raise exception 'Only an authorized administrator can finalize academic terms';
  end if;
  update public.academic_terms set configuration_status = 'finalized', finalized_at = timezone('utc', now()),
    finalized_by_user_id = auth.uid(), updated_at = timezone('utc', now())
  where id = p_term_id and deleted_at is null and configuration_status <> 'finalized';
  if not found then raise exception 'Academic term not found or already finalized'; end if;
end;
$function$;

revoke all on function public.update_academic_term(uuid,date,date,boolean) from public, anon;
grant execute on function public.update_academic_term(uuid,date,date,boolean) to authenticated;
revoke all on function public.finalize_academic_term(uuid) from public, anon;
grant execute on function public.finalize_academic_term(uuid) to authenticated;

-- Required hours are configured per authorized program, academic term, and optional Section.
-- Each assignment still owns its immutable required_hours snapshot.
create table if not exists public.internship_requirement_configs (
  id uuid primary key default gen_random_uuid(),
  academic_term_id uuid not null references public.academic_terms(id) on update cascade on delete restrict,
  academic_program_id uuid not null references public.academic_programs(id) on update cascade on delete restrict,
  section text,
  required_hours integer not null check (required_hours > 0 and required_hours <= 2000),
  created_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  updated_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint internship_requirement_configs_section_check check (section is null or section in ('A','B','C','D','E'))
);
create unique index if not exists internship_requirement_configs_scope_uidx
  on public.internship_requirement_configs (academic_term_id, academic_program_id, section) nulls not distinct
  where deleted_at is null;
alter table public.internship_requirement_configs enable row level security;

create or replace function public.get_internship_requirement_config(p_student_user_id uuid, p_academic_term_id uuid)
returns table(required_hours integer, academic_program_id uuid, section text)
language sql stable security definer set search_path = '' as $function$
  select config.required_hours, student.academic_program_id, student.section
  from public.student_profiles student
  join public.academic_programs program on program.id = student.academic_program_id
  left join lateral (
    select scoped.required_hours
    from public.internship_requirement_configs scoped
    where scoped.academic_term_id = p_academic_term_id
      and scoped.academic_program_id = student.academic_program_id
      and (scoped.section is not distinct from student.section or scoped.section is null)
      and scoped.deleted_at is null
    order by (scoped.section is not null) desc
    limit 1
  ) config on true
  where student.user_id = p_student_user_id and student.deleted_at is null
    and private.has_program_permission('internships:manage', program.owning_org_unit_id, student.academic_program_id);
$function$;

create or replace function public.save_internship_requirement_config(
  p_student_user_id uuid,
  p_academic_term_id uuid,
  p_required_hours integer
)
returns integer language plpgsql security definer set search_path = '' as $function$
declare
  v_program_id uuid;
  v_owner_id uuid;
  v_section text;
begin
  if p_required_hours <= 0 or p_required_hours > 2000 then raise exception 'Required hours must be between 1 and 2000'; end if;
  select student.academic_program_id, program.owning_org_unit_id, student.section
    into v_program_id, v_owner_id, v_section
  from public.student_profiles student join public.academic_programs program on program.id = student.academic_program_id
  where student.user_id = p_student_user_id and student.deleted_at is null and program.deleted_at is null;
  if v_program_id is null or not private.has_program_permission('internships:manage', v_owner_id, v_program_id) then
    raise exception 'The student is outside your authorized program scope';
  end if;
  if not exists (select 1 from public.academic_terms where id = p_academic_term_id and deleted_at is null) then
    raise exception 'Select an available academic term';
  end if;
  insert into public.internship_requirement_configs
    (academic_term_id, academic_program_id, section, required_hours, created_by_user_id, updated_by_user_id)
  values (p_academic_term_id, v_program_id, v_section, p_required_hours, auth.uid(), auth.uid())
  on conflict (academic_term_id, academic_program_id, section) where deleted_at is null
  do update set required_hours = excluded.required_hours, updated_by_user_id = auth.uid(), updated_at = timezone('utc', now());
  return p_required_hours;
end;
$function$;

revoke all on function public.get_internship_requirement_config(uuid,uuid) from public, anon;
grant execute on function public.get_internship_requirement_config(uuid,uuid) to authenticated;
revoke all on function public.save_internship_requirement_config(uuid,uuid,integer) from public, anon;
grant execute on function public.save_internship_requirement_config(uuid,uuid,integer) to authenticated;

create or replace function public.list_internship_requirement_configs()
returns table (
  id uuid,
  academic_term_id uuid,
  term_label text,
  academic_program_id uuid,
  program_label text,
  section text,
  required_hours integer,
  updated_at timestamptz
)
language sql stable security definer set search_path = '' as $function$
  select config.id, config.academic_term_id,
    concat(year.label, ' · ', case term.term when 'first_semester' then '1st Semester' when 'second_semester' then '2nd Semester' when 'midyear' then 'Midyear' else initcap(replace(term.term, '_', ' ')) end),
    config.academic_program_id, concat(program.code, ' · ', program.name), config.section,
    config.required_hours, config.updated_at
  from public.internship_requirement_configs config
  join public.academic_terms term on term.id = config.academic_term_id and term.deleted_at is null
  join public.academic_years year on year.id = term.academic_year_id and year.deleted_at is null
  join public.academic_programs program on program.id = config.academic_program_id and program.deleted_at is null
  where config.deleted_at is null
    and private.has_program_permission('internships:manage', program.owning_org_unit_id, program.id)
  order by term.starts_on desc, program.code, config.section nulls first;
$function$;

create or replace function public.save_internship_requirement_scope(
  p_academic_term_id uuid,
  p_academic_program_id uuid,
  p_section text,
  p_required_hours integer
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_owner_id uuid;
  v_section text := upper(nullif(trim(p_section), ''));
  v_id uuid;
begin
  if p_required_hours <= 0 or p_required_hours > 2000 then raise exception 'Required hours must be between 1 and 2000'; end if;
  if v_section is not null and v_section not in ('A','B','C','D','E') then raise exception 'Section must be A, B, C, D, or E'; end if;
  select owning_org_unit_id into v_owner_id from public.academic_programs
    where id = p_academic_program_id and is_active and deleted_at is null;
  if v_owner_id is null or not private.has_program_permission('internships:manage', v_owner_id, p_academic_program_id) then
    raise exception 'The program is outside your authorized scope';
  end if;
  if not exists (select 1 from public.academic_terms where id = p_academic_term_id and deleted_at is null) then raise exception 'Select an available academic term'; end if;
  insert into public.internship_requirement_configs
    (academic_term_id, academic_program_id, section, required_hours, created_by_user_id, updated_by_user_id)
  values (p_academic_term_id, p_academic_program_id, v_section, p_required_hours, auth.uid(), auth.uid())
  on conflict (academic_term_id, academic_program_id, section) where deleted_at is null
  do update set required_hours = excluded.required_hours, updated_by_user_id = auth.uid(), updated_at = timezone('utc', now())
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.list_internship_requirement_configs() from public, anon;
grant execute on function public.list_internship_requirement_configs() to authenticated;
revoke all on function public.save_internship_requirement_scope(uuid,uuid,text,integer) from public, anon;
grant execute on function public.save_internship_requirement_scope(uuid,uuid,text,integer) to authenticated;

-- A Student Intern may maintain their controlled A-E Section value from Profile.
create or replace function public.update_my_profile_v18(
  p_preferred_name text,
  p_phone text,
  p_avatar_path text,
  p_section text default null
)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_section text := upper(nullif(trim(p_section), ''));
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then raise exception 'Sign in with an active account to edit your profile'; end if;
  if char_length(coalesce(p_preferred_name,'')) > 100 or char_length(coalesce(p_phone,'')) > 40 then raise exception 'Preferred name or contact number is too long'; end if;
  if v_section is not null and v_section not in ('A','B','C','D','E') then raise exception 'Section must be A, B, C, D, or E'; end if;
  if p_avatar_path is not null and not exists(select 1 from storage.objects where bucket_id='profile-photos'
    and name=p_avatar_path and (storage.foldername(name))[1]=auth.uid()::text) then raise exception 'Upload your own profile photo before saving'; end if;
  update public.profiles set preferred_name=nullif(trim(p_preferred_name),''), phone=nullif(trim(p_phone),''), avatar_path=p_avatar_path
    where id=auth.uid() and deleted_at is null;
  if exists (select 1 from public.student_profiles where user_id = auth.uid() and deleted_at is null) then
    update public.student_profiles set section = v_section where user_id = auth.uid() and deleted_at is null;
  end if;
end;
$function$;

revoke all on function public.update_my_profile_v18(text,text,text,text) from public, anon;
grant execute on function public.update_my_profile_v18(text,text,text,text) to authenticated;

commit;

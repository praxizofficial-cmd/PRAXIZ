-- PRAXIZ V22 authoritative repair pass.
-- Keeps authorization server-side, preserves historical assignment snapshots,
-- and exposes only narrowly scoped read models required by the UI.
begin;

-- Public Student Intern registration uses one exact institutional address
-- shape and the mailbox suffix must match the student number. Client checks
-- improve usability; this trigger is the authoritative enforcement point.
create or replace function private.validate_student_registration_v22()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role_code text;
  v_email text := lower(trim(coalesce(new.email, '')));
  v_student_number text := regexp_replace(coalesce(new.submitted_data ->> 'student_number', ''), '[^0-9]', '', 'g');
  v_email_suffix text;
  v_section text := upper(trim(coalesce(new.submitted_data ->> 'section', '')));
  v_year_level text := trim(coalesce(new.submitted_data ->> 'year_level', ''));
  v_term_id uuid;
begin
  select role.code into v_role_code
  from public.roles role
  where role.id = new.requested_role_id and role.is_active;

  if v_role_code <> 'student_intern' then
    return new;
  end if;

  if v_email !~ '^[a-z0-9._%+\-]*[0-9]{3}\.pbox@parsu\.edu\.ph$' then
    raise exception 'Use your institutional email ending in three digits followed by .pbox@parsu.edu.ph';
  end if;
  v_email_suffix := substring(v_email from '([0-9]{3})\.pbox@parsu\.edu\.ph$');
  if length(v_student_number) < 3 or right(v_student_number, 3) <> v_email_suffix then
    raise exception 'The three digits before .pbox must match the last three digits of the student number';
  end if;
  if v_year_level not in ('3', '4') then
    raise exception 'Student Intern registration is available only to Year 3 and Year 4 students';
  end if;
  if v_section not in ('A', 'B', 'C', 'D', 'E') then
    raise exception 'Student Intern section must be A, B, C, D, or E';
  end if;

  v_term_id := private.try_uuid(new.submitted_data ->> 'academic_term_id');
  if v_term_id is null or not exists (
    select 1
    from public.academic_terms term
    join public.academic_years year on year.id = term.academic_year_id
    where term.id = v_term_id
      and term.deleted_at is null
      and year.deleted_at is null
      and term.term in ('first_semester', 'second_semester', 'midyear')
      and (term.is_current or term.configuration_status = 'configured')
  ) then
    raise exception 'Select the active academic term';
  end if;

  new.email := v_email;
  new.submitted_data := jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(new.submitted_data, '{}'::jsonb), '{section}', to_jsonb(v_section), true),
      '{year_level}', to_jsonb(v_year_level), true
    ),
    '{academic_term_id}', to_jsonb(v_term_id::text), true
  );
  return new;
end;
$function$;

drop trigger if exists validate_student_registration_v22 on public.registration_applications;
create trigger validate_student_registration_v22
before insert or update of requested_role_id, email, submitted_data
on public.registration_applications
for each row execute function private.validate_student_registration_v22();

create or replace function public.get_registration_academic_terms()
returns table (id uuid, academic_year text, term text)
language sql
stable
security definer
set search_path = ''
as $function$
  select term.id, year.label, term.term
  from public.academic_terms term
  join public.academic_years year on year.id = term.academic_year_id
  where term.deleted_at is null
    and year.deleted_at is null
    and term.term in ('first_semester', 'second_semester', 'midyear')
    and (term.is_current or term.configuration_status = 'configured')
  order by term.is_current desc, year.starts_on desc, term.starts_on desc;
$function$;
revoke all on function public.get_registration_academic_terms() from public;
grant execute on function public.get_registration_academic_terms() to anon, authenticated;

-- HTE representatives receive a deliberately narrow, server-authorized read
-- model. Direct table policies remain unchanged and no organization id is
-- accepted from the browser.
create or replace function public.list_my_hte_interns_v22()
returns table (
  assignment_id uuid,
  hte_id uuid,
  student_user_id uuid,
  student_name text,
  campus_name text,
  program_code text,
  academic_program_id uuid,
  year_level integer,
  section text,
  hte_name text,
  representative_name text,
  rendered_hours numeric,
  required_hours integer,
  daily_required_hours numeric,
  attendance_percent numeric,
  required_documents integer,
  satisfied_documents integer,
  has_open_issues boolean,
  assignment_status text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with authorized_hte as (
    select representative.hte_id
    from public.hte_representatives representative
    join public.role_assignments role_assignment
      on role_assignment.user_id = representative.user_id
     and role_assignment.scope_hte_id = representative.hte_id
     and role_assignment.deleted_at is null
     and role_assignment.starts_at <= timezone('utc', now())
     and (role_assignment.ends_at is null or role_assignment.ends_at > timezone('utc', now()))
    join public.roles role on role.id = role_assignment.role_id
    where representative.user_id = auth.uid()
      and representative.deleted_at is null
      and (representative.starts_on is null or representative.starts_on <= current_date)
      and (representative.ends_on is null or representative.ends_on >= current_date)
      and role.code = 'hte_supervisor'
      and role.is_active
  ), primary_representative as (
    select distinct on (representative.hte_id)
      representative.hte_id,
      coalesce(nullif(trim(profile.preferred_name), ''), trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name))) as full_name
    from public.hte_representatives representative
    join public.profiles profile on profile.id = representative.user_id and profile.deleted_at is null
    where representative.deleted_at is null
      and (representative.starts_on is null or representative.starts_on <= current_date)
      and (representative.ends_on is null or representative.ends_on >= current_date)
    order by representative.hte_id, representative.is_primary desc, representative.starts_on desc nulls last
  )
  select assignment.id,
    assignment.hte_id,
    assignment.student_user_id,
    coalesce(nullif(trim(student_account.preferred_name), ''), trim(concat_ws(' ', student_account.first_name, student_account.middle_name, student_account.last_name))),
    coalesce(campus.short_name, campus.name),
    program.code,
    assignment.academic_program_id,
    student.year_level,
    student.section,
    coalesce(hte.trade_name, hte.name),
    coalesce(primary_representative.full_name, 'Assigned representative'),
    coalesce(progress.rendered_hours, 0),
    assignment.required_hours,
    assignment.daily_required_hours_snapshot,
    coalesce(progress.attendance_verification_percent, 0),
    coalesce(progress.required_documents, 0),
    coalesce(progress.satisfied_documents, 0),
    coalesce(progress.has_open_issues, false),
    assignment.status
  from public.internship_assignments assignment
  join authorized_hte scope on scope.hte_id = assignment.hte_id
  join public.profiles student_account on student_account.id = assignment.student_user_id and student_account.deleted_at is null
  left join public.student_profiles student on student.user_id = assignment.student_user_id and student.deleted_at is null
  join public.academic_programs program on program.id = assignment.academic_program_id and program.deleted_at is null
  join public.hte_organizations hte on hte.id = assignment.hte_id and hte.deleted_at is null
  join public.org_units campus on campus.id = assignment.campus_org_unit_id and campus.deleted_at is null
  left join public.assignment_progress progress on progress.internship_assignment_id = assignment.id
  left join primary_representative on primary_representative.hte_id = assignment.hte_id
  where assignment.deleted_at is null and assignment.status in ('active', 'completed')
  order by assignment.created_at desc;
$function$;
revoke all on function public.list_my_hte_interns_v22() from public, anon;
grant execute on function public.list_my_hte_interns_v22() to authenticated;

create or replace function public.list_hte_daily_hour_configs_v22()
returns table (
  id uuid,
  hte_id uuid,
  academic_term_id uuid,
  daily_required_hours numeric,
  effective_from date,
  effective_to date,
  status text,
  correction_reason text,
  hte_name text,
  term_label text,
  configured_by text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select config.id,
    config.hte_id,
    config.academic_term_id,
    config.daily_required_hours,
    config.effective_from,
    config.effective_to,
    config.status,
    config.correction_reason,
    coalesce(hte.trade_name, hte.name),
    case when term.id is null then 'All terms in effective period'
      else concat(year.label, ' · ', case term.term
        when 'first_semester' then '1st Semester'
        when 'second_semester' then '2nd Semester'
        when 'midyear' then 'Midyear'
        else initcap(replace(term.term, '_', ' ')) end)
    end,
    coalesce(nullif(trim(profile.preferred_name), ''), trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name))),
    config.updated_at
  from public.hte_daily_hour_configs config
  join public.hte_organizations hte on hte.id = config.hte_id and hte.deleted_at is null
  join public.profiles profile on profile.id = config.created_by_user_id and profile.deleted_at is null
  left join public.academic_terms term on term.id = config.academic_term_id and term.deleted_at is null
  left join public.academic_years year on year.id = term.academic_year_id and year.deleted_at is null
  where private.user_has_role_code(auth.uid(), 'system_admin')
     or exists (
       select 1 from public.hte_representatives representative
       where representative.user_id = auth.uid()
         and representative.hte_id = config.hte_id
         and representative.deleted_at is null
         and (representative.starts_on is null or representative.starts_on <= current_date)
         and (representative.ends_on is null or representative.ends_on >= current_date)
     )
  order by config.updated_at desc;
$function$;
revoke all on function public.list_hte_daily_hour_configs_v22() from public, anon;
grant execute on function public.list_hte_daily_hour_configs_v22() to authenticated;

-- Requirement propagation is optional, explicit, and audited. Only current
-- active records can change; completed, cancelled, draft, and historical
-- assignment snapshots remain untouched.
create table if not exists public.internship_requirement_assignment_updates (
  id uuid primary key default gen_random_uuid(),
  requirement_config_id uuid not null references public.internship_requirement_configs(id) on update cascade on delete restrict,
  internship_assignment_id uuid not null references public.internship_assignments(id) on update cascade on delete restrict,
  previous_required_hours integer not null,
  new_required_hours integer not null,
  changed_by_user_id uuid not null references public.profiles(id) default auth.uid(),
  changed_at timestamptz not null default timezone('utc', now()),
  reason text not null default 'Authorized requirement propagation'
);
alter table public.internship_requirement_assignment_updates enable row level security;

create or replace function public.save_internship_requirement_scope_v22(
  p_academic_term_id uuid,
  p_academic_program_id uuid,
  p_section text,
  p_required_hours integer,
  p_apply_to_current_assignments boolean default false
)
returns table (configuration_id uuid, updated_assignments integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid;
  v_section text := upper(nullif(trim(p_section), ''));
  v_config_id uuid;
  v_updated integer := 0;
begin
  if p_required_hours <= 0 or p_required_hours > 2000 then
    raise exception 'Required hours must be between 1 and 2000';
  end if;
  if v_section is not null and v_section not in ('A', 'B', 'C', 'D', 'E') then
    raise exception 'Section must be A, B, C, D, or E';
  end if;
  select program.owning_org_unit_id into v_owner_id
  from public.academic_programs program
  where program.id = p_academic_program_id and program.is_active and program.deleted_at is null;
  if v_owner_id is null or not private.has_program_permission('internships:manage', v_owner_id, p_academic_program_id) then
    raise exception 'The program is outside your authorized scope';
  end if;
  if not exists (
    select 1 from public.academic_terms term
    where term.id = p_academic_term_id and term.deleted_at is null
  ) then
    raise exception 'Select an available academic term';
  end if;

  insert into public.internship_requirement_configs
    (academic_term_id, academic_program_id, section, required_hours, created_by_user_id, updated_by_user_id)
  values
    (p_academic_term_id, p_academic_program_id, v_section, p_required_hours, auth.uid(), auth.uid())
  on conflict (academic_term_id, academic_program_id, section) where deleted_at is null
  do update set required_hours = excluded.required_hours,
    updated_by_user_id = auth.uid(), updated_at = timezone('utc', now())
  returning id into v_config_id;

  if p_apply_to_current_assignments then
    insert into public.internship_requirement_assignment_updates
      (requirement_config_id, internship_assignment_id, previous_required_hours, new_required_hours, changed_by_user_id)
    select v_config_id, assignment.id, assignment.required_hours, p_required_hours, auth.uid()
    from public.internship_assignments assignment
    join public.student_profiles student on student.user_id = assignment.student_user_id and student.deleted_at is null
    where assignment.academic_term_id = p_academic_term_id
      and assignment.academic_program_id = p_academic_program_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and (v_section is null or student.section = v_section)
      and assignment.required_hours is distinct from p_required_hours;

    update public.internship_assignments assignment
    set required_hours = p_required_hours, updated_at = timezone('utc', now())
    from public.student_profiles student
    where student.user_id = assignment.student_user_id
      and student.deleted_at is null
      and assignment.academic_term_id = p_academic_term_id
      and assignment.academic_program_id = p_academic_program_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and (v_section is null or student.section = v_section)
      and assignment.required_hours is distinct from p_required_hours;
    get diagnostics v_updated = row_count;
  end if;

  return query select v_config_id, v_updated;
end;
$function$;
revoke all on function public.save_internship_requirement_scope_v22(uuid,uuid,text,integer,boolean) from public, anon;
grant execute on function public.save_internship_requirement_scope_v22(uuid,uuid,text,integer,boolean) to authenticated;

-- Required file-format review now has a complete return-for-revision path.
alter table public.required_file_format_versions
  add column if not exists review_feedback text,
  add column if not exists reviewed_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  add column if not exists reviewed_at timestamptz;
alter table public.required_file_format_versions drop constraint if exists required_file_format_versions_status_check;
alter table public.required_file_format_versions add constraint required_file_format_versions_status_check
  check (status in ('submitted', 'returned', 'published', 'retired'));

create or replace function public.return_required_file_format_version_v22(
  p_version_id uuid,
  p_feedback text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.user_has_role_code(auth.uid(), 'system_admin') then
    raise exception 'Only a System Administrator may return a required file format';
  end if;
  if length(trim(coalesce(p_feedback, ''))) = 0 then
    raise exception 'Feedback is required when returning a version';
  end if;
  update public.required_file_format_versions
  set status = 'returned',
      review_feedback = trim(p_feedback),
      reviewed_by_user_id = auth.uid(),
      reviewed_at = timezone('utc', now())
  where id = p_version_id and status = 'submitted';
  if not found then raise exception 'A submitted version is required'; end if;
end;
$function$;
revoke all on function public.return_required_file_format_version_v22(uuid,text) from public, anon;
grant execute on function public.return_required_file_format_version_v22(uuid,text) to authenticated;

commit;

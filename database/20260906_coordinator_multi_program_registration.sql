begin;

-- Pending requests and granted access are separate normalized relationships.
-- Keep the existing primary program columns for older clients and records.
create table if not exists public.registration_application_programs (
  registration_application_id uuid not null references public.registration_applications(id) on delete cascade,
  academic_program_id uuid not null references public.academic_programs(id) on delete restrict,
  primary key (registration_application_id, academic_program_id)
);
create table if not exists public.role_assignment_programs (
  role_assignment_id uuid not null references public.role_assignments(id) on delete cascade,
  academic_program_id uuid not null references public.academic_programs(id) on delete restrict,
  primary key (role_assignment_id, academic_program_id)
);
create index if not exists registration_application_programs_program_idx on public.registration_application_programs(academic_program_id);
create index if not exists role_assignment_programs_program_idx on public.role_assignment_programs(academic_program_id);
alter table public.registration_application_programs enable row level security;
alter table public.role_assignment_programs enable row level security;
revoke all on public.registration_application_programs, public.role_assignment_programs from public, anon, authenticated;
grant select on public.registration_application_programs, public.role_assignment_programs to authenticated;
drop policy if exists registration_application_programs_read on public.registration_application_programs;
create policy registration_application_programs_read on public.registration_application_programs
for select to authenticated using (private.has_any_permission('users:manage'));
drop policy if exists role_assignment_programs_read on public.role_assignment_programs;
create policy role_assignment_programs_read on public.role_assignment_programs
for select to authenticated using (
  private.has_any_permission('users:manage') or exists (
    select 1 from public.role_assignments ra where ra.id = role_assignment_id
      and ra.user_id = (select auth.uid()) and ra.deleted_at is null
      and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
  )
);

-- Backfill only the program already recorded; never infer extra authorization.
insert into public.registration_application_programs
select a.id, a.academic_program_id from public.registration_applications a
join public.roles r on r.id = a.requested_role_id
where r.code = 'internship_coordinator' and a.academic_program_id is not null
on conflict do nothing;
insert into public.role_assignment_programs
select ra.id, ra.scope_academic_program_id from public.role_assignments ra
join public.roles r on r.id = ra.role_id
where r.code = 'internship_coordinator' and ra.scope_academic_program_id is not null
on conflict do nothing;

create or replace function private.sync_registration_application_programs()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_program_ids jsonb;
  v_program_id uuid;
  v_owner_id uuid;
begin
  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    raise exception 'Save program request changes before approving the registration';
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    if new.submitted_data is distinct from old.submitted_data
       or new.academic_program_id is distinct from old.academic_program_id
       or new.organization_unit_id is distinct from old.organization_unit_id
       or new.requested_role_id is distinct from old.requested_role_id then
      raise exception 'Approved registration scope cannot be edited; use authorized access management';
    end if;
    return new;
  end if;
  delete from public.registration_application_programs where registration_application_id = new.id;
  if not exists (select 1 from public.roles r where r.id = new.requested_role_id and r.code = 'internship_coordinator') then
    return new;
  end if;
  v_program_ids := new.submitted_data->'program_ids';
  if v_program_ids is null then
    v_program_ids := jsonb_build_array(new.academic_program_id);
  elsif jsonb_typeof(v_program_ids) = 'string' then
    v_program_ids := (v_program_ids #>> '{}')::jsonb;
  end if;
  if jsonb_typeof(v_program_ids) <> 'array' then
    raise exception 'Coordinator programs must be a list';
  end if;
  if jsonb_array_length(v_program_ids) = 0 or jsonb_array_length(v_program_ids) > 100 then
    raise exception 'Select at least one valid program';
  end if;
  if new.academic_program_id is null or not (v_program_ids @> jsonb_build_array(new.academic_program_id)) then
    raise exception 'The primary program must be one of the selected programs';
  end if;
  for v_program_id in select distinct value::uuid from jsonb_array_elements_text(v_program_ids) loop
    select ap.owning_org_unit_id into v_owner_id from public.academic_programs ap
    where ap.id = v_program_id and ap.is_active and ap.deleted_at is null;
    if v_owner_id is null or new.organization_unit_id is null
       or not private.org_scope_contains(new.organization_unit_id, v_owner_id) then
      raise exception 'A selected program is outside the registration college or campus';
    end if;
    insert into public.registration_application_programs values (new.id, v_program_id);
  end loop;
  return new;
end;
$function$;
revoke all on function private.sync_registration_application_programs() from public, anon, authenticated;
drop trigger if exists sync_registration_application_programs on public.registration_applications;
create trigger sync_registration_application_programs
after insert or update of submitted_data, academic_program_id, requested_role_id, organization_unit_id
on public.registration_applications for each row execute function private.sync_registration_application_programs();

-- One existing role assignment can authorize multiple programs without changing
-- role-assignment uniqueness constraints or creating broad college-wide roles.
create or replace function private.sync_coordinator_program_scope_after_approval()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_assignment_id uuid;
  v_program_id uuid;
begin
  if new.status <> 'approved' or old.status = 'approved' then return new; end if;
  if not exists (select 1 from public.roles r where r.id = new.requested_role_id and r.code = 'internship_coordinator') then return new; end if;
  if new.academic_program_id is null then raise exception 'Select at least one coordinator program'; end if;
  for v_program_id in
    select academic_program_id from public.registration_application_programs where registration_application_id = new.id
    union select new.academic_program_id
  loop
    if not exists (
      select 1 from public.academic_programs ap where ap.id = v_program_id
        and ap.is_active and ap.deleted_at is null
        and new.organization_unit_id is not null
        and private.org_scope_contains(new.organization_unit_id, ap.owning_org_unit_id)
    ) then raise exception 'A coordinator program is outside the approved organization scope'; end if;
  end loop;
  select ra.id into v_assignment_id from public.role_assignments ra
  where ra.user_id = new.requester_user_id and ra.role_id = new.requested_role_id
    and ra.scope_org_unit_id = new.organization_unit_id and ra.scope_hte_id is null
    and ra.deleted_at is null and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
  order by ra.created_at desc, ra.id limit 1;
  if v_assignment_id is null then raise exception 'The approved coordinator role assignment was not found'; end if;
  -- Narrow the base assignment before granting additional exact programs.
  update public.role_assignments set scope_academic_program_id = new.academic_program_id,
    updated_at = now() where id = v_assignment_id;
  delete from public.role_assignment_programs where role_assignment_id = v_assignment_id;
  insert into public.role_assignment_programs
  select v_assignment_id, academic_program_id from public.registration_application_programs where registration_application_id = new.id
  union select v_assignment_id, new.academic_program_id;
  return new;
end;
$function$;
revoke all on function private.sync_coordinator_program_scope_after_approval() from public, anon, authenticated;

-- Keep a later administrator primary-scope change from retaining stale grants.
create or replace function private.reset_coordinator_program_grants()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.scope_academic_program_id is distinct from old.scope_academic_program_id
     or new.scope_org_unit_id is distinct from old.scope_org_unit_id
     or new.role_id is distinct from old.role_id
     or new.user_id is distinct from old.user_id then
    delete from public.role_assignment_programs where role_assignment_id = new.id;
  end if;
  return new;
end;
$function$;
revoke all on function private.reset_coordinator_program_grants() from public, anon, authenticated;
drop trigger if exists reset_coordinator_program_grants on public.role_assignments;
create trigger reset_coordinator_program_grants after update of scope_academic_program_id, scope_org_unit_id, role_id, user_id
on public.role_assignments for each row execute function private.reset_coordinator_program_grants();

create or replace function private.has_program_permission(p_permission_code text, p_target_org_unit_id uuid, p_target_program_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select private.is_active_user((select auth.uid())) and exists (
    select 1 from public.role_assignments ra
    join public.roles r on r.id = ra.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where ra.user_id = (select auth.uid()) and ra.scope_hte_id is null
      and ra.deleted_at is null and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
      and r.is_active and p.is_active and p.code = p_permission_code
      and ((ra.scope_org_unit_id is null and r.allows_global_scope)
        or (p_target_org_unit_id is not null and private.org_scope_contains(ra.scope_org_unit_id, p_target_org_unit_id)))
      and (
        (r.code <> 'internship_coordinator' and ra.scope_academic_program_id is null)
        or (p_target_program_id is not null and (
          ra.scope_academic_program_id = p_target_program_id
          or (r.code = 'internship_coordinator' and exists (
            select 1 from public.role_assignment_programs rap
            where rap.role_assignment_id = ra.id and rap.academic_program_id = p_target_program_id
          ))
        ))
      )
  );
$function$;

create or replace function public.get_coordinator_assignment_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.academic_programs ap
    where ap.is_active and ap.deleted_at is null
      and private.has_program_permission('internships:manage', ap.owning_org_unit_id, ap.id)
  ) then raise exception 'You are not authorized to create internship assignments'; end if;

  select jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', student.user_id,
        'studentNumber', student.student_number,
        'programId', student.academic_program_id,
        'label', concat_ws(' · ', coalesce(nullif(trim(profile.preferred_name), ''), trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name))), student.student_number)
      ) order by profile.last_name, profile.first_name)
      from public.student_profiles student
      join public.profiles profile on profile.id = student.user_id
      join public.academic_programs program on program.id = student.academic_program_id
      where program.is_active and program.deleted_at is null
        and private.has_program_permission('internships:manage', program.owning_org_unit_id, program.id)
        and student.deleted_at is null and profile.deleted_at is null and profile.account_status = 'active'
    ), '[]'::jsonb),
    'htes', coalesce((
      select jsonb_agg(jsonb_build_object('id', hte.id, 'label', coalesce(hte.trade_name, hte.name)) order by coalesce(hte.trade_name, hte.name))
      from public.hte_organizations hte
      where hte.verification_status = 'verified' and hte.deleted_at is null
    ), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', term.id,
        'label', concat(year.label, ' · ', initcap(replace(term.term, '_', ' '))),
        'startsOn', term.starts_on,
        'endsOn', term.ends_on
      ) order by term.starts_on desc)
      from public.academic_terms term
      join public.academic_years year on year.id = term.academic_year_id
      where term.deleted_at is null and year.deleted_at is null
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.get_coordinator_assignment_options() from public;
grant execute on function public.get_coordinator_assignment_options() to authenticated;

create or replace function public.create_coordinator_assignment(
  p_student_user_id uuid,
  p_hte_id uuid,
  p_academic_term_id uuid,
  p_required_hours integer,
  p_start_date date,
  p_expected_end_date date,
  p_submit_for_approval boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program_id uuid;
  v_program_owner_id uuid;
  v_campus_id uuid;
  v_assignment_id uuid;
begin
  select student.academic_program_id, program.owning_org_unit_id
  into v_program_id, v_program_owner_id
  from public.student_profiles student
  join public.academic_programs program on program.id = student.academic_program_id
  where student.user_id = p_student_user_id and student.deleted_at is null
    and program.is_active and program.deleted_at is null
    and private.has_program_permission('internships:manage', program.owning_org_unit_id, program.id);
  if v_program_id is null then
    raise exception 'The student is not in your authorized programs';
  end if;
  if p_required_hours <= 0 or p_expected_end_date < p_start_date then
    raise exception 'Required hours and assignment dates are invalid';
  end if;
  if not exists (
    select 1 from public.student_profiles student join public.profiles profile on profile.id = student.user_id
    where student.user_id = p_student_user_id and student.academic_program_id = v_program_id
      and student.deleted_at is null and profile.deleted_at is null and profile.account_status = 'active'
  ) then
    raise exception 'The student is not active in your assigned academic program';
  end if;
  if not exists (select 1 from public.hte_organizations hte where hte.id = p_hte_id and hte.verification_status = 'verified' and hte.deleted_at is null) then
    raise exception 'Select a verified HTE';
  end if;
  if not exists (select 1 from public.academic_terms term where term.id = p_academic_term_id and term.deleted_at is null) then
    raise exception 'Select an available academic term';
  end if;
  select campus.org_unit_id into v_campus_id
  from public.campuses campus
  join public.org_units unit on unit.id = campus.org_unit_id
  where unit.is_active and unit.deleted_at is null
    and private.org_scope_contains(campus.org_unit_id, v_program_owner_id)
  limit 1;
  if v_campus_id is null then raise exception 'The program campus could not be resolved'; end if;

  insert into public.internship_assignments (
    student_user_id, academic_term_id, campus_org_unit_id, academic_program_id,
    hte_id, required_hours, start_date, expected_end_date, status, created_by_user_id
  ) values (
    p_student_user_id, p_academic_term_id, v_campus_id, v_program_id,
    p_hte_id, p_required_hours, p_start_date, p_expected_end_date,
    case when p_submit_for_approval then 'pending_approval' else 'draft' end,
    (select auth.uid())
  ) returning id into v_assignment_id;

  insert into public.internship_supervisors (
    internship_assignment_id, supervisor_user_id, supervisor_type, is_primary, started_at, created_by_user_id
  ) values (
    v_assignment_id, (select auth.uid()), 'coordinator', true, timezone('utc', now()), (select auth.uid())
  );
  return v_assignment_id;
end;
$function$;

revoke all on function public.create_coordinator_assignment(uuid, uuid, uuid, integer, date, date, boolean) from public;
grant execute on function public.create_coordinator_assignment(uuid, uuid, uuid, integer, date, date, boolean) to authenticated;

commit;

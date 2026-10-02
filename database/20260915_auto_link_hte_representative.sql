-- Automatically bind the active primary representative whenever a coordinator
-- creates an assignment for a verified partner HTE. Backfill existing rows that
-- were created before this workflow guard existed.
begin;

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
  v_hte_supervisor_id uuid;
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

  select representative.user_id
  into v_hte_supervisor_id
  from public.hte_representatives representative
  join public.role_assignments role_assignment on role_assignment.user_id = representative.user_id
  join public.roles role on role.id = role_assignment.role_id
  where representative.hte_id = p_hte_id
    and representative.deleted_at is null
    and (representative.starts_on is null or representative.starts_on <= current_date)
    and (representative.ends_on is null or representative.ends_on >= current_date)
    and role.code = 'hte_supervisor'
    and role.is_active
    and role_assignment.scope_org_unit_id is null
    and role_assignment.scope_hte_id = p_hte_id
    and role_assignment.deleted_at is null
    and role_assignment.starts_at <= timezone('utc', now())
    and (role_assignment.ends_at is null or role_assignment.ends_at > timezone('utc', now()))
  order by representative.is_primary desc, representative.starts_on desc nulls last, representative.user_id
  limit 1;
  if v_hte_supervisor_id is null then
    raise exception 'The selected HTE does not have an active representative';
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
    case when p_submit_for_approval then 'active' else 'draft' end,
    (select auth.uid())
  ) returning id into v_assignment_id;

  insert into public.internship_supervisors (
    internship_assignment_id, supervisor_user_id, supervisor_type, is_primary, started_at, created_by_user_id
  ) values (
    v_assignment_id, (select auth.uid()), 'coordinator', true, timezone('utc', now()), (select auth.uid())
  );

  insert into public.internship_supervisors (
    internship_assignment_id, supervisor_user_id, supervisor_type, is_primary, started_at, created_by_user_id
  ) values (
    v_assignment_id, v_hte_supervisor_id, 'hte', true,
    timezone('utc', p_start_date::timestamp), (select auth.uid())
  );
  return v_assignment_id;
end;
$function$;

revoke all on function public.create_coordinator_assignment(uuid, uuid, uuid, integer, date, date, boolean) from public;
grant execute on function public.create_coordinator_assignment(uuid, uuid, uuid, integer, date, date, boolean) to authenticated;

insert into public.internship_supervisors (
  internship_assignment_id, supervisor_user_id, supervisor_type, is_primary, started_at, created_by_user_id
)
select assignment.id, representative.user_id, 'hte', true,
  timezone('utc', assignment.start_date::timestamp), assignment.created_by_user_id
from public.internship_assignments assignment
join lateral (
  select representative.user_id
  from public.hte_representatives representative
  join public.role_assignments role_assignment on role_assignment.user_id = representative.user_id
  join public.roles role on role.id = role_assignment.role_id
  where representative.hte_id = assignment.hte_id
    and representative.deleted_at is null
    and (representative.starts_on is null or representative.starts_on <= current_date)
    and (representative.ends_on is null or representative.ends_on >= current_date)
    and role.code = 'hte_supervisor'
    and role.is_active
    and role_assignment.scope_org_unit_id is null
    and role_assignment.scope_hte_id = assignment.hte_id
    and role_assignment.deleted_at is null
    and role_assignment.starts_at <= timezone('utc', now())
    and (role_assignment.ends_at is null or role_assignment.ends_at > timezone('utc', now()))
  order by representative.is_primary desc, representative.starts_on desc nulls last, representative.user_id
  limit 1
) representative on true
where assignment.deleted_at is null
  and assignment.status not in ('completed', 'cancelled')
  and not exists (
    select 1
    from public.internship_supervisors existing
    where existing.internship_assignment_id = assignment.id
      and existing.supervisor_type = 'hte'
      and existing.deleted_at is null
      and existing.ended_at is null
  );

commit;

begin;

-- A coordinator's student roster follows the academic program selected by the
-- student. Placement assignment data remains a separate workflow because it
-- requires an HTE, term, dates, hours, and supervisors.
create or replace function public.list_coordinator_program_students()
returns table (
  student_user_id uuid,
  full_name text,
  student_number text,
  academic_program_id uuid,
  program_code text,
  program_name text,
  campus_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    student.user_id,
    coalesce(
      nullif(trim(profile.preferred_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name)), ''),
      profile.email
    ) as full_name,
    student.student_number,
    student.academic_program_id,
    program.code,
    program.name,
    coalesce(campus.short_name, campus.name, owner.short_name, owner.name, 'Assigned campus') as campus_name
  from public.student_profiles student
  join public.profiles profile
    on profile.id = student.user_id
  join public.academic_programs program
    on program.id = student.academic_program_id
  left join public.org_units owner
    on owner.id = program.owning_org_unit_id
  left join public.org_units campus
    on campus.id = owner.parent_id
   and campus.unit_type = 'campus'
  where student.deleted_at is null
    and profile.deleted_at is null
    and profile.account_status = 'active'
    and program.deleted_at is null
    and program.is_active
    and exists (
      select 1
      from public.role_assignments student_role
      join public.roles role
        on role.id = student_role.role_id
      where student_role.user_id = student.user_id
        and role.code = 'student_intern'
        and role.is_active
        and student_role.deleted_at is null
        and student_role.starts_at <= timezone('utc', now())
        and (student_role.ends_at is null or student_role.ends_at > timezone('utc', now()))
    )
    and private.has_program_permission(
      'internships:manage',
      program.owning_org_unit_id,
      student.academic_program_id
    )
  order by full_name;
$function$;

revoke all on function public.list_coordinator_program_students() from public;
grant execute on function public.list_coordinator_program_students() to authenticated;

commit;

-- Coordinators can browse verified partner HTEs before an internship assignment
-- exists. Permit them to read the display identity of each active HTE
-- representative so the partner list never falls back to a generic label.
begin;

create or replace function private.can_view_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_active_user((select auth.uid()))
    and (
      p_user_id = (select auth.uid())
      or private.has_permission('users:manage', null)
      or exists (
        select 1
        from public.internship_assignments assignment
        where assignment.student_user_id = p_user_id
          and assignment.deleted_at is null
          and private.can_view_assignment(assignment.id)
      )
      or exists (
        select 1
        from public.internship_supervisors supervisor
        where supervisor.supervisor_user_id = p_user_id
          and supervisor.deleted_at is null
          and private.can_view_assignment(supervisor.internship_assignment_id)
      )
      or (
        exists (
          select 1
          from public.role_assignments assignment
          join public.roles role on role.id = assignment.role_id
          where assignment.user_id = (select auth.uid())
            and role.code = 'internship_coordinator'
            and role.is_active
            and assignment.deleted_at is null
            and assignment.starts_at <= timezone('utc', now())
            and (assignment.ends_at is null or assignment.ends_at > timezone('utc', now()))
        )
        and exists (
          select 1
          from public.hte_representatives representative
          join public.hte_organizations organization on organization.id = representative.hte_id
          where representative.user_id = p_user_id
            and representative.deleted_at is null
            and (representative.starts_on is null or representative.starts_on <= current_date)
            and (representative.ends_on is null or representative.ends_on >= current_date)
            and organization.verification_status = 'verified'
            and organization.deleted_at is null
        )
      )
    );
$function$;

revoke all on function private.can_view_user(uuid) from public, anon;
grant execute on function private.can_view_user(uuid) to authenticated;

commit;

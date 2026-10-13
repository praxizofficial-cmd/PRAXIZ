-- PRAXIZ V23 emergency stabilization.
-- Repairs institution-wide Placement Head scope and grants the table privileges
-- required for the existing RLS policies to take effect.
begin;

grant select on table public.placement_compliance_requirements to authenticated;
grant select, insert on table public.placement_compliance_submissions to authenticated;
grant select, insert on table public.placement_compliance_reviews to authenticated;
grant select on table public.required_file_formats to authenticated;
grant select, insert, update on table public.required_file_format_versions to authenticated;

create or replace function private.coordinator_scope_includes(p_org_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive authorized_roots as (
    select assignment.scope_org_unit_id
    from public.role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.user_id = auth.uid()
      and role.code = 'internship_coordinator'
      and role.is_active
      and assignment.deleted_at is null
      and assignment.starts_at <= timezone('utc', now())
      and (assignment.ends_at is null or assignment.ends_at > timezone('utc', now()))
  ), ancestors as (
    select unit.id, unit.parent_id
    from public.org_units unit
    where unit.id = p_org_unit_id and unit.deleted_at is null and unit.is_active
    union all
    select parent.id, parent.parent_id
    from public.org_units parent
    join ancestors child on child.parent_id = parent.id
    where parent.deleted_at is null and parent.is_active
  )
  select p_org_unit_id is null
    or exists (
      select 1
      from authorized_roots root
      join ancestors unit on unit.id = root.scope_org_unit_id
    );
$function$;
revoke all on function private.coordinator_scope_includes(uuid) from public, anon;
grant execute on function private.coordinator_scope_includes(uuid) to authenticated, service_role;

drop policy if exists placement_requirements_read on public.placement_compliance_requirements;
create policy placement_requirements_read
on public.placement_compliance_requirements
for select to authenticated
using (
  private.user_has_role_code(auth.uid(), 'system_admin')
  or (
    private.user_has_role_code(auth.uid(), 'placement_head')
    and private.placement_scope_includes(scope_org_unit_id)
  )
  or (
    private.user_has_role_code(auth.uid(), 'internship_coordinator')
    and private.coordinator_scope_includes(scope_org_unit_id)
  )
);

-- Placement Head is an institution-wide role. Existing role assignments are
-- normalized without deleting their registration or audit history.
update public.role_assignments assignment
set scope_org_unit_id = null
from public.roles role
where role.id = assignment.role_id
  and role.code = 'placement_head'
  and assignment.deleted_at is null
  and assignment.scope_org_unit_id is not null;

create or replace function public.complete_placement_head_provisioning(
  p_application_id uuid,
  p_authorized_by_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  application public.registration_applications%rowtype;
  authorization_record public.account_provisioning_authorizations%rowtype;
  requested_code text;
  notification_id uuid;
begin
  select item.* into application
  from public.registration_applications item
  where item.id = p_application_id and item.deleted_at is null
  for update;

  if application.id is null
     or application.requester_user_id is null
     or application.status not in ('pending', 'under_review') then
    raise exception 'The invited Placement Head registration was not found or was already completed';
  end if;

  select role.code into requested_code
  from public.roles role
  where role.id = application.requested_role_id and role.is_active;
  if requested_code <> 'placement_head' then
    raise exception 'The requested role is not Placement Head';
  end if;
  if not private.user_has_role_code(p_authorized_by_user_id, 'system_admin') then
    raise exception 'Only a System Administrator may create a Placement Head';
  end if;

  select item.* into authorization_record
  from public.account_provisioning_authorizations item
  where lower(item.email) = lower(application.email)
    and item.requested_role_id = application.requested_role_id
    and item.authorized_by_user_id = p_authorized_by_user_id
    and item.consumed_at is not null
    and item.completed_at is null
    and item.expires_at > timezone('utc', now())
  order by item.created_at desc
  limit 1
  for update;
  if authorization_record.id is null then
    raise exception 'The privileged invitation authorization is invalid or expired';
  end if;

  insert into public.role_assignments(
    user_id, role_id, scope_org_unit_id, assigned_by_user_id
  ) values (
    application.requester_user_id,
    application.requested_role_id,
    null,
    p_authorized_by_user_id
  ) on conflict do nothing;

  update public.profiles
  set account_status = 'active', updated_at = timezone('utc', now())
  where id = application.requester_user_id;
  update public.registration_applications
  set status = 'approved',
      campus_org_unit_id = null,
      organization_unit_id = null,
      reviewed_by_user_id = p_authorized_by_user_id,
      reviewed_at = timezone('utc', now()),
      review_notes = 'Institution-wide Placement Head account created through authorized server-side provisioning.',
      updated_at = timezone('utc', now())
  where id = application.id;
  update public.account_provisioning_authorizations
  set completed_at = timezone('utc', now())
  where id = authorization_record.id;

  insert into public.notifications(
    type, title, message, severity, actor_user_id,
    related_entity_type, related_entity_id
  ) values (
    'registration_approved',
    'PRAXIZ account ready',
    'Your institution-wide Placement Head account is active. Set your password from the invitation email, then use the universal sign-in page.',
    'success',
    p_authorized_by_user_id,
    'registration_application',
    application.id
  ) returning id into notification_id;
  insert into public.notification_recipients(notification_id, user_id)
  values(notification_id, application.requester_user_id);

  return jsonb_build_object(
    'application_id', application.id,
    'user_id', application.requester_user_id,
    'role', requested_code,
    'scope', 'institution_wide',
    'status', 'approved'
  );
end;
$function$;
revoke all on function public.complete_placement_head_provisioning(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.complete_placement_head_provisioning(uuid, uuid)
to service_role;

commit;

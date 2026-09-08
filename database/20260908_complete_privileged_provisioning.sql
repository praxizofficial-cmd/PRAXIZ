-- Complete privileged invitations in one database transaction. The server-only
-- service role may invoke this function only after an authenticated authorized
-- user created and consumed a short-lived provisioning authorization.
begin;

alter table public.account_provisioning_authorizations
  add column if not exists completed_at timestamptz;

create or replace function public.complete_authorized_account_provisioning(
  p_application_id uuid,
  p_authorized_by_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  application public.registration_applications%rowtype;
  authorization_record public.account_provisioning_authorizations%rowtype;
  requested_code text;
  assignment_id uuid;
  notification_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Privileged account completion is server-only';
  end if;

  select item.* into application
  from public.registration_applications item
  where item.id = p_application_id and item.deleted_at is null
  for update;
  if application.id is null or application.requester_user_id is null then
    raise exception 'The invited registration application was not found';
  end if;
  if application.status not in ('pending', 'under_review') then
    raise exception 'The invited registration has already been completed';
  end if;

  select role.code into requested_code
  from public.roles role
  where role.id = application.requested_role_id and role.is_active;
  if requested_code not in ('internship_coordinator', 'hte_supervisor') then
    raise exception 'Only Coordinator and HTE Representative invitations may be completed';
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

  if requested_code = 'internship_coordinator' then
    if not exists (
      select 1 from public.role_assignments assignment
      join public.roles role on role.id = assignment.role_id
      join public.profiles profile on profile.id = assignment.user_id
      where assignment.user_id = p_authorized_by_user_id
        and role.code = 'system_admin' and role.is_active
        and profile.account_status = 'active'
        and assignment.deleted_at is null
        and assignment.starts_at <= timezone('utc', now())
        and (assignment.ends_at is null or assignment.ends_at > timezone('utc', now()))
    ) then raise exception 'Only a System Administrator may create an Internship Coordinator'; end if;
    if application.organization_unit_id is null or application.academic_program_id is null then
      raise exception 'Coordinator invitations require an academic unit and primary program';
    end if;

    insert into public.role_assignments (
      user_id, role_id, scope_org_unit_id, scope_hte_id,
      scope_academic_program_id, assigned_by_user_id
    ) values (
      application.requester_user_id, application.requested_role_id,
      application.organization_unit_id, null, application.academic_program_id,
      p_authorized_by_user_id
    ) on conflict do nothing
    returning id into assignment_id;
    if assignment_id is null then
      select item.id into assignment_id from public.role_assignments item
      where item.user_id = application.requester_user_id
        and item.role_id = application.requested_role_id
        and item.deleted_at is null
      order by item.created_at desc limit 1;
    end if;
    if assignment_id is null then raise exception 'The Coordinator role assignment could not be created'; end if;

    insert into public.user_org_memberships (user_id, org_unit_id, membership_type, is_primary)
    values (application.requester_user_id, application.organization_unit_id, 'coordinator', true)
    on conflict do nothing;
  else
    if not exists (
      select 1 from public.role_assignments assignment
      join public.roles role on role.id = assignment.role_id
      join public.profiles profile on profile.id = assignment.user_id
      where assignment.user_id = p_authorized_by_user_id
        and role.code = 'internship_coordinator' and role.is_active
        and profile.account_status = 'active'
        and assignment.deleted_at is null
        and assignment.starts_at <= timezone('utc', now())
        and (assignment.ends_at is null or assignment.ends_at > timezone('utc', now()))
    ) then raise exception 'Only an Internship Coordinator may create an HTE Representative'; end if;
    if authorization_record.scope_hte_id is null or not exists (
      select 1 from public.hte_organizations hte
      where hte.id = authorization_record.scope_hte_id
        and hte.verification_status = 'verified' and hte.deleted_at is null
    ) then raise exception 'The invitation requires a verified partner HTE'; end if;

    insert into public.role_assignments (
      user_id, role_id, scope_org_unit_id, scope_hte_id,
      scope_academic_program_id, assigned_by_user_id
    ) values (
      application.requester_user_id, application.requested_role_id,
      null, authorization_record.scope_hte_id, null, p_authorized_by_user_id
    ) on conflict do nothing;
    insert into public.hte_representatives (hte_id, user_id, job_title, is_primary)
    values (
      authorization_record.scope_hte_id, application.requester_user_id,
      coalesce(nullif(application.submitted_data ->> 'position', ''), 'HTE Representative'), true
    ) on conflict do nothing;
  end if;

  update public.profiles
  set account_status = 'active', updated_at = timezone('utc', now())
  where id = application.requester_user_id;
  update public.registration_applications
  set status = 'approved', reviewed_by_user_id = p_authorized_by_user_id,
      reviewed_at = timezone('utc', now()),
      review_notes = 'Created through authorized server-side provisioning.',
      updated_at = timezone('utc', now())
  where id = application.id;
  update public.account_provisioning_authorizations
  set completed_at = timezone('utc', now()) where id = authorization_record.id;

  insert into public.notifications (
    type, title, message, severity, actor_user_id,
    related_entity_type, related_entity_id
  ) values (
    'registration_approved', 'PRAXIZ account ready',
    'Your authorized PRAXIZ account is active. Set your password from the invitation email, then use the universal sign-in page.',
    'success', p_authorized_by_user_id, 'registration_application', application.id
  ) returning id into notification_id;
  insert into public.notification_recipients (notification_id, user_id)
  values (notification_id, application.requester_user_id);

  return jsonb_build_object(
    'application_id', application.id,
    'user_id', application.requester_user_id,
    'role', requested_code,
    'status', 'approved'
  );
end;
$function$;

revoke all on function public.complete_authorized_account_provisioning(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_authorized_account_provisioning(uuid, uuid) to service_role;

commit;

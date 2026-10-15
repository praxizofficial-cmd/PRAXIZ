-- Allow a server-authorized Placement Head invitation to create its pending
-- registration application. Public self-registration remains student-only:
-- privileged roles still require an unexpired authorization record that was
-- written by the protected server provisioning route.
begin;
set local role postgres;

create or replace function private.enforce_public_student_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_code text;
  v_authorization public.account_provisioning_authorizations%rowtype;
begin
  select role.code into requested_code
  from public.roles role
  where role.id = new.requested_role_id;

  if requested_code = 'student_intern' then
    return new;
  end if;

  if requested_code not in (
    'internship_coordinator',
    'hte_supervisor',
    'placement_head'
  ) then
    raise exception 'This role cannot be requested through public account creation';
  end if;

  select * into v_authorization
  from public.account_provisioning_authorizations item
  where lower(item.email) = lower(new.email)
    and item.requested_role_id = new.requested_role_id
    and item.consumed_at is null
    and item.expires_at > timezone('utc', now())
  order by item.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Privileged accounts require an authorized PRAXIZ invitation';
  end if;

  new.submitted_data = coalesce(new.submitted_data, '{}'::jsonb)
    || v_authorization.metadata
    || jsonb_build_object(
      'provisioned_by_user_id',
      v_authorization.authorized_by_user_id::text
    );

  update public.account_provisioning_authorizations
  set consumed_at = timezone('utc', now())
  where id = v_authorization.id;

  return new;
end;
$function$;

-- The program synchronizer is shared by all registration applications because
-- its trigger watches generic scope columns. Only coordinator applications have
-- program rows, so the approval precondition must be evaluated after confirming
-- that role. Approved records of every role remain immutable.
create or replace function private.sync_registration_application_programs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program_ids jsonb;
  v_program_id uuid;
  v_owner_id uuid;
begin
  if tg_op = 'UPDATE' and old.status = 'approved' then
    if new.submitted_data is distinct from old.submitted_data
       or new.academic_program_id is distinct from old.academic_program_id
       or new.organization_unit_id is distinct from old.organization_unit_id
       or new.requested_role_id is distinct from old.requested_role_id then
      raise exception 'Approved registration scope cannot be edited; use authorized access management';
    end if;
    return new;
  end if;

  delete from public.registration_application_programs
  where registration_application_id = new.id;

  if not exists (
    select 1
    from public.roles role
    where role.id = new.requested_role_id
      and role.code = 'internship_coordinator'
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    raise exception 'Save program request changes before approving the registration';
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
  if jsonb_array_length(v_program_ids) = 0
     or jsonb_array_length(v_program_ids) > 100 then
    raise exception 'Select at least one valid program';
  end if;
  if new.academic_program_id is null
     or not (v_program_ids @> jsonb_build_array(new.academic_program_id)) then
    raise exception 'The primary program must be one of the selected programs';
  end if;

  for v_program_id in
    select distinct value::uuid
    from jsonb_array_elements_text(v_program_ids)
  loop
    select program.owning_org_unit_id into v_owner_id
    from public.academic_programs program
    where program.id = v_program_id
      and program.is_active
      and program.deleted_at is null;

    if v_owner_id is null
       or new.organization_unit_id is null
       or not private.org_scope_contains(new.organization_unit_id, v_owner_id) then
      raise exception 'A selected program is outside the registration college or campus';
    end if;

    insert into public.registration_application_programs(
      registration_application_id,
      academic_program_id
    ) values (new.id, v_program_id);
  end loop;

  return new;
end;
$function$;

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
  where item.id = p_application_id
    and item.deleted_at is null
  for update;

  if application.id is null
     or application.requester_user_id is null
     or application.status not in ('pending', 'under_review') then
    raise exception 'The invited Placement Head registration was not found or was already completed';
  end if;

  select role.code into requested_code
  from public.roles role
  where role.id = application.requested_role_id
    and role.is_active;
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
    user_id,
    role_id,
    scope_org_unit_id,
    assigned_by_user_id
  ) values (
    application.requester_user_id,
    application.requested_role_id,
    null,
    p_authorized_by_user_id
  ) on conflict do nothing;

  update public.profiles
  set account_status = 'active',
      updated_at = timezone('utc', now())
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

  notification_id := private.emit_notification(
    'registration-approved:placement-head:' || application.id::text,
    'registration_approved',
    'PRAXIZ account ready',
    'Your institution-wide Placement Head account is active. Set your password from the invitation email, then use the universal sign-in page.',
    'success',
    p_authorized_by_user_id,
    null,
    'registration_application',
    application.id,
    array[application.requester_user_id],
    jsonb_build_object('role', 'placement_head')
  );

  return jsonb_build_object(
    'application_id', application.id,
    'user_id', application.requester_user_id,
    'role', requested_code,
    'scope', 'institution_wide',
    'status', 'approved',
    'notification_id', notification_id
  );
end;
$function$;

revoke all on function public.complete_placement_head_provisioning(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.complete_placement_head_provisioning(uuid, uuid)
to service_role;

commit;

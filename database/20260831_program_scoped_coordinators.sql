begin;

-- Coordinators are authorized for one academic program inside their existing
-- campus/college organization scope. Global roles (for example system_admin)
-- continue to use a null program scope.
alter table public.role_assignments
  add column if not exists scope_academic_program_id uuid
  references public.academic_programs(id) on update cascade on delete restrict;

create index if not exists role_assignments_program_scope_idx
  on public.role_assignments(scope_academic_program_id)
  where deleted_at is null and scope_academic_program_id is not null;

comment on column public.role_assignments.scope_academic_program_id is
  'Optional academic-program boundary applied in addition to organization scope.';

create or replace function private.validate_role_assignment_program_scope()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_program_owner_id uuid;
begin
  if new.scope_academic_program_id is null then
    return new;
  end if;

  if new.scope_hte_id is not null or new.scope_org_unit_id is null then
    raise exception 'An academic program scope requires an organization scope and cannot be combined with an HTE scope';
  end if;

  select ap.owning_org_unit_id
  into v_program_owner_id
  from public.academic_programs ap
  where ap.id = new.scope_academic_program_id
    and ap.is_active
    and ap.deleted_at is null;

  if v_program_owner_id is null then
    raise exception 'The selected academic program is not active';
  end if;

  if not private.org_scope_contains(new.scope_org_unit_id, v_program_owner_id) then
    raise exception 'The selected academic program is outside the assigned organization scope';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_role_assignment_program_scope on public.role_assignments;
create trigger validate_role_assignment_program_scope
before insert or update of scope_org_unit_id, scope_hte_id, scope_academic_program_id
on public.role_assignments
for each row execute function private.validate_role_assignment_program_scope();

create or replace function private.has_program_permission(
  p_permission_code text,
  p_target_org_unit_id uuid,
  p_target_program_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select private.is_active_user((select auth.uid()))
  and exists (
    select 1
    from public.role_assignments ra
    join public.roles r on r.id = ra.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where ra.user_id = (select auth.uid())
      and ra.scope_hte_id is null
      and ra.deleted_at is null
      and ra.starts_at <= timezone('utc', now())
      and (ra.ends_at is null or ra.ends_at > timezone('utc', now()))
      and r.is_active
      and p.is_active
      and p.code = p_permission_code
      and (
        (
          p_target_org_unit_id is null
          and ra.scope_org_unit_id is null
          and r.allows_global_scope
        )
        or (
          p_target_org_unit_id is not null
          and (
            (ra.scope_org_unit_id is null and r.allows_global_scope)
            or private.org_scope_contains(ra.scope_org_unit_id, p_target_org_unit_id)
          )
        )
      )
      and (
        ra.scope_academic_program_id is null
        or (
          p_target_program_id is not null
          and ra.scope_academic_program_id = p_target_program_id
        )
      )
  );
$function$;

create or replace function private.can_manage_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.internship_assignments ia
    join public.academic_programs ap on ap.id = ia.academic_program_id
    where ia.id = p_assignment_id
      and ia.deleted_at is null
      and private.has_program_permission(
        'internships:manage',
        ap.owning_org_unit_id,
        ia.academic_program_id
      )
  );
$function$;

create or replace function private.can_view_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select private.is_active_user((select auth.uid()))
  and exists (
    select 1
    from public.internship_assignments ia
    join public.academic_programs ap on ap.id = ia.academic_program_id
    where ia.id = p_assignment_id
      and ia.deleted_at is null
      and (
        ia.student_user_id = (select auth.uid())
        or private.has_program_permission(
          'internships:manage',
          ap.owning_org_unit_id,
          ia.academic_program_id
        )
        or exists (
          select 1
          from public.internship_supervisors ins
          where ins.internship_assignment_id = ia.id
            and ins.supervisor_user_id = (select auth.uid())
            and ins.deleted_at is null
            and ins.started_at <= timezone('utc', now())
            and (ins.ended_at is null or ins.ended_at > timezone('utc', now()))
        )
      )
  );
$function$;

drop policy if exists internship_assignments_coordinator_write
  on public.internship_assignments;
create policy internship_assignments_coordinator_write
on public.internship_assignments
for all
to authenticated
using (private.can_manage_assignment(id))
with check (
  private.has_program_permission(
    'internships:manage',
    (
      select ap.owning_org_unit_id
      from public.academic_programs ap
      where ap.id = internship_assignments.academic_program_id
        and ap.deleted_at is null
    ),
    academic_program_id
  )
);

-- review_registration creates the role assignment before marking an
-- application approved. This trigger attaches and validates the program in
-- the same transaction, so future coordinator approvals cannot be college-wide.
create or replace function private.sync_coordinator_program_scope_after_approval()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role_code text;
  v_program_owner_id uuid;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select r.code
  into v_role_code
  from public.roles r
  where r.id = new.requested_role_id;

  if v_role_code <> 'internship_coordinator' then
    return new;
  end if;

  if new.academic_program_id is null then
    raise exception 'An internship coordinator must be assigned to an academic program';
  end if;

  select ap.owning_org_unit_id
  into v_program_owner_id
  from public.academic_programs ap
  where ap.id = new.academic_program_id
    and ap.is_active
    and ap.deleted_at is null;

  if v_program_owner_id is null
     or new.organization_unit_id is null
     or not private.org_scope_contains(new.organization_unit_id, v_program_owner_id) then
    raise exception 'The coordinator program is outside the approved organization scope';
  end if;

  update public.role_assignments ra
  set scope_academic_program_id = new.academic_program_id,
      updated_at = timezone('utc', now())
  where ra.user_id = new.requester_user_id
    and ra.role_id = new.requested_role_id
    and ra.deleted_at is null
    and ra.starts_at <= timezone('utc', now())
    and (ra.ends_at is null or ra.ends_at > timezone('utc', now()));

  if not found then
    raise exception 'The approved coordinator role assignment was not found';
  end if;

  return new;
end;
$function$;

drop trigger if exists sync_coordinator_program_scope_after_approval
  on public.registration_applications;
create trigger sync_coordinator_program_scope_after_approval
after update of status on public.registration_applications
for each row execute function private.sync_coordinator_program_scope_after_approval();

-- Lilith Yap Tria is the Goa Main Campus BAT coordinator. Correct the legacy
-- application and active role assignment that were approved before program
-- scope existed.
update public.registration_applications
set academic_program_id = '40000000-0000-4000-8000-000000000028'::uuid,
    submitted_data = jsonb_set(
      coalesce(submitted_data, '{}'::jsonb),
      '{program_id}',
      to_jsonb('40000000-0000-4000-8000-000000000028'::text),
      true
    ),
    updated_at = timezone('utc', now())
where id = '9193f496-28e7-4016-a8aa-347b435b4037'::uuid;

update public.role_assignments
set scope_academic_program_id = '40000000-0000-4000-8000-000000000028'::uuid,
    updated_at = timezone('utc', now())
where id = '951ea3aa-ddf6-4c5a-94be-92787e352464'::uuid;

do $block$
begin
  if exists (
    select 1
    from public.role_assignments ra
    join public.roles r on r.id = ra.role_id
    where r.code = 'internship_coordinator'
      and ra.deleted_at is null
      and ra.scope_academic_program_id is null
  ) then
    raise exception 'Every active internship coordinator must have an academic program scope';
  end if;
end;
$block$;

commit;

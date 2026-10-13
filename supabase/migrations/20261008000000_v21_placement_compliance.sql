-- PRAXIZ V21 deployable migration: Placement Head, term lifecycle, HTE daily hours, compliance,
-- required-file publication, and incomplete attendance sessions.
begin;

create or replace function private.user_has_role_code(p_user_id uuid, p_role_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    join public.profiles profile on profile.id = assignment.user_id
    where assignment.user_id = p_user_id and role.code = p_role_code
      and role.is_active and profile.account_status = 'active'
      and assignment.deleted_at is null
      and assignment.starts_at <= timezone('utc', now())
      and (assignment.ends_at is null or assignment.ends_at > timezone('utc', now()))
  );
$$;
revoke all on function private.user_has_role_code(uuid,text) from public, anon;
grant execute on function private.user_has_role_code(uuid,text) to authenticated, service_role;

-- Extend the existing role-catalog safeguard before activating Placement Head.
-- The trigger remains authoritative; V21 only adds the fifth supported role.
create or replace function private.validate_active_role_catalog() returns trigger
language plpgsql set search_path = '' as $function$
begin
  if (new.is_active or new.is_assignable) and new.code::text not in
    ('student_intern','internship_coordinator','hte_supervisor','system_admin','placement_head') then
    raise exception 'Only the five supported application roles can be active or assignable';
  end if;
  return new;
end $function$;

insert into public.roles (code, name, description, is_system, is_assignable, allows_global_scope, is_active)
values ('placement_head', 'Placement Head', 'Institutional placement compliance and analytics oversight.', true, true, true, true)
on conflict (code) do update set name = excluded.name, description = excluded.description,
  is_assignable = true, allows_global_scope = true, is_active = true, updated_at = timezone('utc', now());

insert into public.permissions (code, description, category, is_active) values
  ('placement:read', 'View placement hierarchy and real operational analytics', 'placement', true),
  ('placement:manage', 'Manage placement compliance reviews and requirement configuration', 'placement', true),
  ('file-formats:submit', 'Submit controlled required-file formats for publication', 'placement', true),
  ('file-formats:publish', 'Publish controlled required-file formats', 'administration', true)
on conflict (code) do update set description = excluded.description, category = excluded.category, is_active = true, updated_at = timezone('utc', now());

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role cross join public.permissions permission
where role.code = 'placement_head' and permission.code in ('placement:read','placement:manage','file-formats:submit')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role cross join public.permissions permission
where role.code = 'system_admin' and permission.code = 'file-formats:publish'
on conflict do nothing;

-- Academic terms are explicitly controlled by administrators. Reaching the end
-- date never finalizes a term; it only makes Pending Closure available.
alter table public.academic_terms drop constraint if exists academic_terms_configuration_status_check;
update public.academic_terms set configuration_status = 'active'
where configuration_status = 'configured';
alter table public.academic_terms add constraint academic_terms_configuration_status_check
  check (configuration_status in ('draft','active','pending_closure','finalized'));

create or replace function public.create_academic_term(
  p_academic_year_id uuid, p_term text, p_starts_on date, p_ends_on date,
  p_is_current boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_term_id uuid;
begin
  if auth.uid() is null or not private.user_has_role_code(auth.uid(),'system_admin') then raise exception 'Only a System Administrator may create academic terms'; end if;
  if p_ends_on < p_starts_on then raise exception 'The end date must be on or after the start date'; end if;
  insert into public.academic_terms(academic_year_id,term,starts_on,ends_on,is_current,configuration_status)
  values(p_academic_year_id,p_term,p_starts_on,p_ends_on,false,'draft') returning id into v_term_id;
  return v_term_id;
end;
$$;
revoke all on function public.create_academic_term(uuid,text,date,date,boolean) from public, anon;
grant execute on function public.create_academic_term(uuid,text,date,date,boolean) to authenticated;

create or replace function public.update_academic_term(
  p_term_id uuid, p_starts_on date, p_ends_on date, p_is_current boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if auth.uid() is null or not private.user_has_role_code(auth.uid(),'system_admin') then raise exception 'Only a System Administrator may update academic terms'; end if;
  if p_ends_on < p_starts_on then raise exception 'The end date must be on or after the start date'; end if;
  select configuration_status into v_status from public.academic_terms where id = p_term_id and deleted_at is null for update;
  if v_status is null then raise exception 'Academic term not found'; end if;
  if v_status = 'finalized' then raise exception 'Finalized academic terms are read-only'; end if;
  update public.academic_terms set starts_on = p_starts_on, ends_on = p_ends_on, updated_at = timezone('utc', now()) where id = p_term_id;
end;
$$;
revoke all on function public.update_academic_term(uuid,date,date,boolean) from public, anon;
grant execute on function public.update_academic_term(uuid,date,date,boolean) to authenticated;

create or replace function public.transition_academic_term(p_term_id uuid, p_new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not private.user_has_role_code(auth.uid(), 'system_admin') then raise exception 'Only a System Administrator may change the academic-term lifecycle'; end if;
  if p_new_status not in ('draft','active','pending_closure','finalized') then raise exception 'Unsupported academic-term status'; end if;
  select configuration_status into v_old from public.academic_terms where id = p_term_id and deleted_at is null for update;
  if v_old is null then raise exception 'Academic term not found'; end if;
  if v_old = 'finalized' then raise exception 'Finalized academic terms are read-only'; end if;
  if not ((v_old = 'draft' and p_new_status = 'active') or (v_old = 'active' and p_new_status = 'pending_closure') or (v_old = 'pending_closure' and p_new_status in ('active','finalized'))) then
    raise exception 'Invalid academic-term transition from % to %', v_old, p_new_status;
  end if;
  if p_new_status = 'active' then
    update public.academic_terms set is_current = false, updated_at = timezone('utc', now()) where id <> p_term_id and is_current and deleted_at is null;
  end if;
  update public.academic_terms set configuration_status = p_new_status,
    is_current = (p_new_status = 'active'),
    finalized_at = case when p_new_status = 'finalized' then timezone('utc', now()) else finalized_at end,
    finalized_by_user_id = case when p_new_status = 'finalized' then auth.uid() else finalized_by_user_id end,
    updated_at = timezone('utc', now()) where id = p_term_id;
end;
$$;
revoke all on function public.transition_academic_term(uuid,text) from public, anon;
grant execute on function public.transition_academic_term(uuid,text) to authenticated;

create or replace function public.mark_ended_terms_pending_closure()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if not private.user_has_role_code(auth.uid(), 'system_admin') then raise exception 'Only a System Administrator may check ended academic terms'; end if;
  update public.academic_terms set configuration_status = 'pending_closure', is_current = false, updated_at = timezone('utc', now())
  where configuration_status = 'active' and ends_on < (timezone('Asia/Manila', now()))::date and deleted_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.mark_ended_terms_pending_closure() from public, anon;
grant execute on function public.mark_ended_terms_pending_closure() to authenticated;

-- HTE-owned daily hours configuration. There is intentionally no default.
create table if not exists public.hte_daily_hour_configs (
  id uuid primary key default gen_random_uuid(),
  hte_id uuid not null references public.hte_organizations(id) on update cascade on delete restrict,
  academic_term_id uuid references public.academic_terms(id) on update cascade on delete restrict,
  daily_required_hours numeric(4,2) not null check (daily_required_hours > 0 and daily_required_hours <= 24),
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('active','retired')),
  created_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict default auth.uid(),
  corrected_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  correction_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (effective_to is null or effective_to >= effective_from)
);
create index if not exists hte_daily_hour_configs_lookup_idx on public.hte_daily_hour_configs(hte_id, academic_term_id, effective_from desc) where status = 'active';
alter table public.hte_daily_hour_configs enable row level security;
drop policy if exists hte_daily_hours_read on public.hte_daily_hour_configs;
create policy hte_daily_hours_read on public.hte_daily_hour_configs for select to authenticated using (
  private.user_has_role_code(auth.uid(),'system_admin') or private.user_has_role_code(auth.uid(),'placement_head') or
  exists (select 1 from public.hte_representatives representative where representative.hte_id = hte_daily_hour_configs.hte_id and representative.user_id = auth.uid() and representative.deleted_at is null) or
  exists (
    select 1 from public.internship_assignments assignment
    join public.internship_supervisors supervisor on supervisor.internship_assignment_id = assignment.id
    where assignment.hte_id = hte_daily_hour_configs.hte_id
      and assignment.deleted_at is null
      and supervisor.supervisor_user_id = auth.uid()
      and supervisor.supervisor_type = 'coordinator'
      and supervisor.deleted_at is null
      and supervisor.started_at <= timezone('utc', now())
      and (supervisor.ended_at is null or supervisor.ended_at > timezone('utc', now()))
  )
);
drop policy if exists hte_daily_hours_write on public.hte_daily_hour_configs;
create policy hte_daily_hours_write on public.hte_daily_hour_configs for all to authenticated using (
  private.user_has_role_code(auth.uid(),'system_admin') or exists (select 1 from public.hte_representatives representative where representative.hte_id = hte_daily_hour_configs.hte_id and representative.user_id = auth.uid() and representative.deleted_at is null)
) with check (
  private.user_has_role_code(auth.uid(),'system_admin') or exists (select 1 from public.hte_representatives representative where representative.hte_id = hte_daily_hour_configs.hte_id and representative.user_id = auth.uid() and representative.deleted_at is null)
);
alter table public.internship_assignments add column if not exists daily_required_hours_snapshot numeric(4,2) check (daily_required_hours_snapshot > 0 and daily_required_hours_snapshot <= 24);

create or replace function private.snapshot_hte_daily_hours() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.daily_required_hours_snapshot is null then
    select config.daily_required_hours into new.daily_required_hours_snapshot
    from public.hte_daily_hour_configs config
    where config.hte_id = new.hte_id and config.status = 'active'
      and (config.academic_term_id is null or config.academic_term_id = new.academic_term_id)
      and config.effective_from <= new.start_date
      and (config.effective_to is null or config.effective_to >= new.start_date)
    order by (config.academic_term_id is not null) desc, config.effective_from desc limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists snapshot_hte_daily_hours on public.internship_assignments;
create trigger snapshot_hte_daily_hours before insert on public.internship_assignments for each row execute function private.snapshot_hte_daily_hours();

create or replace function public.save_hte_daily_hour_config(
  p_hte_id uuid,
  p_academic_term_id uuid,
  p_daily_required_hours numeric,
  p_effective_from date,
  p_effective_to date default null,
  p_correction_reason text default null,
  p_apply_to_active_assignments boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.user_has_role_code(auth.uid(),'system_admin') and not exists (
    select 1 from public.hte_representatives representative
    where representative.user_id = auth.uid() and representative.hte_id = p_hte_id and representative.deleted_at is null
  ) then raise exception 'You cannot configure another HTE organization'; end if;
  if p_daily_required_hours <= 0 or p_daily_required_hours > 24 then raise exception 'Daily required hours must be between 0 and 24'; end if;
  if private.user_has_role_code(auth.uid(),'system_admin') and length(trim(coalesce(p_correction_reason,''))) = 0 then
    raise exception 'An administrator correction reason is required';
  end if;
  update public.hte_daily_hour_configs set status = 'retired', updated_at = timezone('utc', now())
  where hte_id = p_hte_id and academic_term_id is not distinct from p_academic_term_id and status = 'active';
  insert into public.hte_daily_hour_configs(hte_id,academic_term_id,daily_required_hours,effective_from,effective_to,created_by_user_id,corrected_by_user_id,correction_reason)
  values (p_hte_id,p_academic_term_id,p_daily_required_hours,p_effective_from,p_effective_to,auth.uid(),case when private.user_has_role_code(auth.uid(),'system_admin') then auth.uid() end,nullif(trim(coalesce(p_correction_reason,'')),''))
  returning id into v_id;
  if p_apply_to_active_assignments then
    update public.internship_assignments set daily_required_hours_snapshot = p_daily_required_hours, updated_at = timezone('utc', now())
    where hte_id = p_hte_id and status = 'active' and deleted_at is null
      and (p_academic_term_id is null or academic_term_id = p_academic_term_id);
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_hte_daily_hour_config(uuid,uuid,numeric,date,date,text,boolean) from public, anon;
grant execute on function public.save_hte_daily_hour_config(uuid,uuid,numeric,date,date,text,boolean) to authenticated;

-- Prior-day open sessions become incomplete. No Time Out event is invented.
alter table public.attendance_sessions drop constraint if exists attendance_sessions_status_check;
alter table public.attendance_sessions add constraint attendance_sessions_status_check
  check (status in ('open','incomplete','pending_verification','verified','flagged','rejected','voided'));
create or replace function public.close_my_stale_attendance_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.attendance_sessions session set status = 'incomplete', updated_at = timezone('utc', now())
  from public.internship_assignments assignment
  where session.internship_assignment_id = assignment.id and assignment.student_user_id = auth.uid()
    and session.status = 'open' and session.work_date < (timezone('Asia/Manila', now()))::date and session.deleted_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.close_my_stale_attendance_sessions() from public, anon;
grant execute on function public.close_my_stale_attendance_sessions() to authenticated;

-- Placement Head compliance requirements and immutable submission versions.
create table if not exists public.placement_compliance_requirements (
  id uuid primary key default gen_random_uuid(), scope_org_unit_id uuid references public.org_units(id) on update cascade on delete restrict,
  academic_term_id uuid references public.academic_terms(id) on update cascade on delete restrict,
  title text not null, description text, due_at timestamptz,
  allowed_mime_types text[] not null default array['application/pdf']::text[], max_file_size_bytes bigint not null default 20971520,
  is_active boolean not null default true, created_by_user_id uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table if not exists public.placement_compliance_submissions (
  id uuid primary key default gen_random_uuid(), requirement_id uuid not null references public.placement_compliance_requirements(id) on update cascade on delete restrict,
  coordinator_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  version_number integer not null, object_path text not null, original_name text not null, mime_type text not null, byte_size bigint not null,
  notes text, status text not null default 'submitted' check (status in ('submitted','needs_resubmission','approved')),
  submitted_at timestamptz not null default timezone('utc', now()), archived_at timestamptz,
  unique(requirement_id, coordinator_user_id, version_number)
);
create table if not exists public.placement_compliance_reviews (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.placement_compliance_submissions(id) on update cascade on delete restrict,
  reviewer_user_id uuid not null references public.profiles(id) default auth.uid(), decision text not null check (decision in ('approved','needs_resubmission')),
  feedback text, reviewed_at timestamptz not null default timezone('utc', now()),
  check (decision <> 'needs_resubmission' or length(trim(coalesce(feedback,''))) > 0)
);

create table if not exists public.required_file_formats (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, description text,
  scope_org_unit_id uuid references public.org_units(id) on update cascade on delete restrict,
  is_active boolean not null default true, created_by_user_id uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table if not exists public.required_file_format_versions (
  id uuid primary key default gen_random_uuid(), format_id uuid not null references public.required_file_formats(id) on update cascade on delete restrict,
  version_number integer not null, object_path text not null, original_name text not null, mime_type text not null, byte_size bigint not null,
  status text not null default 'submitted' check (status in ('submitted','published','retired')),
  submitted_by_user_id uuid not null references public.profiles(id) default auth.uid(), submitted_at timestamptz not null default timezone('utc', now()),
  published_by_user_id uuid references public.profiles(id), published_at timestamptz,
  unique(format_id, version_number)
);
create table if not exists public.coordinator_record_archives (
  id uuid primary key default gen_random_uuid(), coordinator_user_id uuid not null references public.profiles(id) default auth.uid(),
  internship_assignment_id uuid not null references public.internship_assignments(id) on update cascade on delete restrict,
  archived_at timestamptz not null default timezone('utc', now()), archive_reason text,
  unique(coordinator_user_id, internship_assignment_id)
);

alter table public.placement_compliance_requirements enable row level security;
alter table public.placement_compliance_submissions enable row level security;
alter table public.placement_compliance_reviews enable row level security;
alter table public.required_file_formats enable row level security;
alter table public.required_file_format_versions enable row level security;
alter table public.coordinator_record_archives enable row level security;

create or replace function private.placement_scope_includes(p_org_unit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with recursive authorized_roots as (
    select assignment.scope_org_unit_id
    from public.role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.user_id = auth.uid() and role.code = 'placement_head' and role.is_active
      and assignment.deleted_at is null and assignment.starts_at <= timezone('utc', now())
      and (assignment.ends_at is null or assignment.ends_at > timezone('utc', now()))
  ), authorized_units as (
    select scope_org_unit_id as id from authorized_roots where scope_org_unit_id is not null
    union all
    select child.id from public.org_units child join authorized_units parent on child.parent_id = parent.id
    where child.deleted_at is null and child.is_active
  )
  select exists(select 1 from authorized_roots where scope_org_unit_id is null)
    or (p_org_unit_id is not null and exists(select 1 from authorized_units where id = p_org_unit_id));
$$;
revoke all on function private.placement_scope_includes(uuid) from public, anon;
grant execute on function private.placement_scope_includes(uuid) to authenticated, service_role;

create or replace function private.placement_can_read_assignment(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.internship_assignments assignment
    join public.academic_programs program on program.id = assignment.academic_program_id
    where assignment.id = p_assignment_id and assignment.deleted_at is null
      and (private.placement_scope_includes(assignment.campus_org_unit_id) or private.placement_scope_includes(program.owning_org_unit_id))
  );
$$;
revoke all on function private.placement_can_read_assignment(uuid) from public, anon;
grant execute on function private.placement_can_read_assignment(uuid) to authenticated, service_role;

create or replace function public.create_placement_compliance_requirement(p_title text, p_description text, p_due_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_scope uuid; v_id uuid;
begin
  if not private.user_has_role_code(auth.uid(),'placement_head') then raise exception 'Only a Placement Head may create placement requirements'; end if;
  select assignment.scope_org_unit_id into v_scope from public.role_assignments assignment
  join public.roles role on role.id = assignment.role_id
  where assignment.user_id = auth.uid() and role.code = 'placement_head' and role.is_active and assignment.deleted_at is null
    and assignment.starts_at <= timezone('utc', now()) and (assignment.ends_at is null or assignment.ends_at > timezone('utc', now()))
  -- Prefer the most specific active scope when a user has more than one
  -- assignment. A global (NULL) scope is only used when no scoped assignment
  -- exists, so requirement creation never widens access accidentally.
  order by assignment.scope_org_unit_id nulls last limit 1;
  insert into public.placement_compliance_requirements(scope_org_unit_id,title,description,due_at,created_by_user_id)
  values(v_scope,trim(p_title),nullif(trim(coalesce(p_description,'')),''),p_due_at,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_placement_compliance_requirement(text,text,timestamptz) from public, anon;
grant execute on function public.create_placement_compliance_requirement(text,text,timestamptz) to authenticated;

create or replace function public.create_required_file_format(p_code text, p_name text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_scope uuid; v_id uuid;
begin
  if not private.user_has_role_code(auth.uid(),'placement_head') then raise exception 'Only a Placement Head may create required file formats'; end if;
  select assignment.scope_org_unit_id into v_scope from public.role_assignments assignment
  join public.roles role on role.id = assignment.role_id
  where assignment.user_id = auth.uid() and role.code = 'placement_head' and role.is_active and assignment.deleted_at is null
    and assignment.starts_at <= timezone('utc', now()) and (assignment.ends_at is null or assignment.ends_at > timezone('utc', now()))
  order by assignment.scope_org_unit_id nulls last limit 1;
  insert into public.required_file_formats(code,name,description,scope_org_unit_id,created_by_user_id)
  values(upper(trim(p_code)),trim(p_name),nullif(trim(coalesce(p_description,'')),''),v_scope,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_required_file_format(text,text,text) from public, anon;
grant execute on function public.create_required_file_format(text,text,text) to authenticated;

create policy placement_requirements_read on public.placement_compliance_requirements for select to authenticated using (
  (private.user_has_role_code(auth.uid(),'placement_head') and private.placement_scope_includes(scope_org_unit_id)) or private.user_has_role_code(auth.uid(),'system_admin') or private.user_has_role_code(auth.uid(),'internship_coordinator'));
create policy placement_requirements_manage on public.placement_compliance_requirements for all to authenticated using (private.user_has_role_code(auth.uid(),'placement_head') and private.placement_scope_includes(scope_org_unit_id)) with check (private.user_has_role_code(auth.uid(),'placement_head') and private.placement_scope_includes(scope_org_unit_id));
create policy placement_submissions_read on public.placement_compliance_submissions for select to authenticated using (coordinator_user_id = auth.uid() or private.user_has_role_code(auth.uid(),'system_admin') or (private.user_has_role_code(auth.uid(),'placement_head') and exists(select 1 from public.placement_compliance_requirements requirement where requirement.id = placement_compliance_submissions.requirement_id and private.placement_scope_includes(requirement.scope_org_unit_id))));
create policy placement_submissions_coordinator_write on public.placement_compliance_submissions for insert to authenticated with check (coordinator_user_id = auth.uid() and private.user_has_role_code(auth.uid(),'internship_coordinator'));
create policy placement_submissions_placement_update on public.placement_compliance_submissions for update to authenticated using (private.user_has_role_code(auth.uid(),'placement_head') and exists(select 1 from public.placement_compliance_requirements requirement where requirement.id = placement_compliance_submissions.requirement_id and private.placement_scope_includes(requirement.scope_org_unit_id))) with check (private.user_has_role_code(auth.uid(),'placement_head'));
create policy placement_reviews_read on public.placement_compliance_reviews for select to authenticated using (
  private.user_has_role_code(auth.uid(),'system_admin') or
  exists (
    select 1 from public.placement_compliance_submissions submission
    join public.placement_compliance_requirements requirement on requirement.id = submission.requirement_id
    where submission.id = placement_compliance_reviews.submission_id and
      (submission.coordinator_user_id = auth.uid() or
       (private.user_has_role_code(auth.uid(),'placement_head') and private.placement_scope_includes(requirement.scope_org_unit_id)))
  )
);
create policy placement_reviews_write on public.placement_compliance_reviews for insert to authenticated with check (reviewer_user_id = auth.uid() and private.user_has_role_code(auth.uid(),'placement_head') and exists(select 1 from public.placement_compliance_submissions submission join public.placement_compliance_requirements requirement on requirement.id = submission.requirement_id where submission.id = placement_compliance_reviews.submission_id and private.placement_scope_includes(requirement.scope_org_unit_id)));
create policy required_formats_read on public.required_file_formats for select to authenticated using (
  private.user_has_role_code(auth.uid(),'system_admin') or
  (private.user_has_role_code(auth.uid(),'placement_head') and private.placement_scope_includes(scope_org_unit_id)) or
  (is_active and exists (
    select 1 from public.required_file_format_versions version
    where version.format_id = required_file_formats.id and version.status = 'published'
  ))
);
create policy required_formats_manage on public.required_file_formats for all to authenticated using (private.user_has_role_code(auth.uid(),'placement_head') and private.placement_scope_includes(scope_org_unit_id)) with check (private.user_has_role_code(auth.uid(),'placement_head') and private.placement_scope_includes(scope_org_unit_id));
create policy required_format_versions_read on public.required_file_format_versions for select to authenticated using (status = 'published' or submitted_by_user_id = auth.uid() or private.user_has_role_code(auth.uid(),'system_admin'));
create policy required_format_versions_submit on public.required_file_format_versions for insert to authenticated with check (submitted_by_user_id = auth.uid() and private.user_has_role_code(auth.uid(),'placement_head'));
create policy required_format_versions_publish on public.required_file_format_versions for update to authenticated using (private.user_has_role_code(auth.uid(),'system_admin')) with check (private.user_has_role_code(auth.uid(),'system_admin'));
create policy coordinator_archives_self on public.coordinator_record_archives for all to authenticated using (coordinator_user_id = auth.uid()) with check (coordinator_user_id = auth.uid() and private.user_has_role_code(auth.uid(),'internship_coordinator'));

-- Reuse the platform's existing audit pipeline for every consequential V21
-- configuration, version, review, and archive change.
drop trigger if exists audit_hte_daily_hour_configs_after_change on public.hte_daily_hour_configs;
create trigger audit_hte_daily_hour_configs_after_change after insert or update or delete on public.hte_daily_hour_configs
for each row execute function private.write_audit_log();
drop trigger if exists audit_placement_requirements_after_change on public.placement_compliance_requirements;
create trigger audit_placement_requirements_after_change after insert or update or delete on public.placement_compliance_requirements
for each row execute function private.write_audit_log();
drop trigger if exists audit_placement_submissions_after_change on public.placement_compliance_submissions;
create trigger audit_placement_submissions_after_change after insert or update or delete on public.placement_compliance_submissions
for each row execute function private.write_audit_log();
drop trigger if exists audit_placement_reviews_after_change on public.placement_compliance_reviews;
create trigger audit_placement_reviews_after_change after insert or update or delete on public.placement_compliance_reviews
for each row execute function private.write_audit_log();
drop trigger if exists audit_required_file_formats_after_change on public.required_file_formats;
create trigger audit_required_file_formats_after_change after insert or update or delete on public.required_file_formats
for each row execute function private.write_audit_log();
drop trigger if exists audit_required_file_format_versions_after_change on public.required_file_format_versions;
create trigger audit_required_file_format_versions_after_change after insert or update or delete on public.required_file_format_versions
for each row execute function private.write_audit_log();
drop trigger if exists audit_coordinator_record_archives_after_change on public.coordinator_record_archives;
create trigger audit_coordinator_record_archives_after_change after insert or update or delete on public.coordinator_record_archives
for each row execute function private.write_audit_log();

create or replace function public.review_placement_compliance_submission(p_submission_id uuid, p_decision text, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.user_has_role_code(auth.uid(),'placement_head') then raise exception 'Only a Placement Head may review placement compliance'; end if;
  if not exists(select 1 from public.placement_compliance_submissions submission join public.placement_compliance_requirements requirement on requirement.id = submission.requirement_id where submission.id = p_submission_id and private.placement_scope_includes(requirement.scope_org_unit_id)) then raise exception 'Submission is outside your authorized institutional scope'; end if;
  if p_decision not in ('approved','needs_resubmission') then raise exception 'Unsupported review decision'; end if;
  if p_decision = 'needs_resubmission' and length(trim(coalesce(p_feedback,''))) = 0 then raise exception 'Feedback is required when requesting resubmission'; end if;
  insert into public.placement_compliance_reviews(submission_id,reviewer_user_id,decision,feedback)
  values (p_submission_id,auth.uid(),p_decision,nullif(trim(coalesce(p_feedback,'')),''));
  update public.placement_compliance_submissions set status = p_decision where id = p_submission_id;
  if not found then raise exception 'Submission not found'; end if;
end;
$$;
revoke all on function public.review_placement_compliance_submission(uuid,text,text) from public, anon;
grant execute on function public.review_placement_compliance_submission(uuid,text,text) to authenticated;

create or replace function public.publish_required_file_format_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.user_has_role_code(auth.uid(),'system_admin') then raise exception 'Only a System Administrator may publish required file formats'; end if;
  update public.required_file_format_versions set status = 'retired'
  where format_id = (select format_id from public.required_file_format_versions where id = p_version_id) and status = 'published' and id <> p_version_id;
  update public.required_file_format_versions set status = 'published', published_by_user_id = auth.uid(), published_at = timezone('utc', now()) where id = p_version_id and status = 'submitted';
  if not found then raise exception 'A submitted version is required'; end if;
end;
$$;
revoke all on function public.publish_required_file_format_version(uuid) from public, anon;
grant execute on function public.publish_required_file_format_version(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('placement-compliance','placement-compliance',false,20971520,array['application/pdf']::text[]),
       ('required-file-formats','required-file-formats',false,26214400,null)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists placement_compliance_objects_read on storage.objects;
create policy placement_compliance_objects_read on storage.objects for select to authenticated using (
  bucket_id = 'placement-compliance' and exists (
    select 1 from public.placement_compliance_submissions submission where submission.object_path = name
  )
);
drop policy if exists placement_compliance_objects_insert on storage.objects;
create policy placement_compliance_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'placement-compliance' and (storage.foldername(name))[1] = auth.uid()::text and private.user_has_role_code(auth.uid(),'internship_coordinator')
);
drop policy if exists required_file_format_objects_read on storage.objects;
create policy required_file_format_objects_read on storage.objects for select to authenticated using (
  bucket_id = 'required-file-formats' and exists (
    select 1 from public.required_file_format_versions version where version.object_path = name
  )
);
drop policy if exists required_file_format_objects_insert on storage.objects;
create policy required_file_format_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'required-file-formats' and private.user_has_role_code(auth.uid(),'placement_head')
);

-- Placement Heads receive read-only access to the verified hierarchy in their
-- trusted org-unit scope; administrators retain their existing access.
create policy internship_assignments_placement_read on public.internship_assignments for select to authenticated using (private.user_has_role_code(auth.uid(),'placement_head') and private.placement_can_read_assignment(id));
create policy internship_supervisors_placement_read on public.internship_supervisors for select to authenticated using (
  private.user_has_role_code(auth.uid(),'placement_head')
  and private.placement_can_read_assignment(internship_assignment_id)
);
create policy profiles_placement_read on public.profiles for select to authenticated using (
  private.user_has_role_code(auth.uid(),'placement_head') and (
    id = auth.uid() or
    exists (
      select 1 from public.internship_assignments assignment
      where assignment.student_user_id = profiles.id
        and private.placement_can_read_assignment(assignment.id)
    ) or
    exists (
      select 1 from public.internship_supervisors supervisor
      where supervisor.supervisor_user_id = profiles.id
        and supervisor.supervisor_type = 'coordinator'
        and supervisor.deleted_at is null
        and private.placement_can_read_assignment(supervisor.internship_assignment_id)
    )
  )
);

-- Generated PRAXIZ identifier and optional organization identifier are distinct.
alter table public.hte_representatives add column if not exists praxiz_reference_no text;
alter table public.hte_representatives add column if not exists external_hte_id text;
create unique index if not exists hte_representatives_praxiz_reference_uq on public.hte_representatives(lower(praxiz_reference_no)) where deleted_at is null and praxiz_reference_no is not null;
update public.hte_representatives representative set praxiz_reference_no = application.reference_no
from public.registration_applications application
where application.requester_user_id = representative.user_id and representative.praxiz_reference_no is null and application.reference_no is not null;

create or replace function private.sync_hte_representative_identifiers() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select application.reference_no, nullif(application.submitted_data ->> 'external_hte_id','')
    into new.praxiz_reference_no, new.external_hte_id
  from public.registration_applications application
  where application.requester_user_id = new.user_id and application.deleted_at is null
  order by application.created_at desc limit 1;
  return new;
end;
$$;
drop trigger if exists sync_hte_representative_identifiers on public.hte_representatives;
create trigger sync_hte_representative_identifiers before insert or update of user_id on public.hte_representatives for each row execute function private.sync_hte_representative_identifiers();

create or replace function public.complete_placement_head_provisioning(
  p_application_id uuid,
  p_authorized_by_user_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  application public.registration_applications%rowtype;
  authorization_record public.account_provisioning_authorizations%rowtype;
  requested_code text;
  notification_id uuid;
begin
  select item.* into application from public.registration_applications item
  where item.id = p_application_id and item.deleted_at is null for update;
  if application.id is null or application.requester_user_id is null or application.status not in ('pending','under_review') then
    raise exception 'The invited Placement Head registration was not found or was already completed';
  end if;
  select role.code into requested_code from public.roles role where role.id = application.requested_role_id and role.is_active;
  if requested_code <> 'placement_head' then raise exception 'The requested role is not Placement Head'; end if;
  if not private.user_has_role_code(p_authorized_by_user_id,'system_admin') then raise exception 'Only a System Administrator may create a Placement Head'; end if;
  if application.organization_unit_id is null then raise exception 'Placement Head invitations require an institutional scope'; end if;
  select item.* into authorization_record from public.account_provisioning_authorizations item
  where lower(item.email) = lower(application.email) and item.requested_role_id = application.requested_role_id
    and item.authorized_by_user_id = p_authorized_by_user_id and item.consumed_at is not null
    and item.completed_at is null and item.expires_at > timezone('utc', now())
  order by item.created_at desc limit 1 for update;
  if authorization_record.id is null then raise exception 'The privileged invitation authorization is invalid or expired'; end if;
  insert into public.role_assignments(user_id,role_id,scope_org_unit_id,assigned_by_user_id)
  values(application.requester_user_id,application.requested_role_id,application.organization_unit_id,p_authorized_by_user_id)
  on conflict do nothing;
  insert into public.user_org_memberships(user_id,org_unit_id,membership_type,is_primary)
  values(application.requester_user_id,application.organization_unit_id,'staff',true) on conflict do nothing;
  update public.profiles set account_status = 'active', updated_at = timezone('utc', now()) where id = application.requester_user_id;
  update public.registration_applications set status = 'approved', reviewed_by_user_id = p_authorized_by_user_id,
    reviewed_at = timezone('utc', now()), review_notes = 'Placement Head account created through authorized server-side provisioning.',
    updated_at = timezone('utc', now()) where id = application.id;
  update public.account_provisioning_authorizations set completed_at = timezone('utc', now()) where id = authorization_record.id;
  insert into public.notifications(type,title,message,severity,actor_user_id,related_entity_type,related_entity_id)
  values('registration_approved','PRAXIZ account ready','Your Placement Head account is active. Set your password from the invitation email, then use the universal sign-in page.','success',p_authorized_by_user_id,'registration_application',application.id)
  returning id into notification_id;
  insert into public.notification_recipients(notification_id,user_id) values(notification_id,application.requester_user_id);
  return jsonb_build_object('application_id',application.id,'user_id',application.requester_user_id,'role',requested_code,'status','approved');
end;
$$;
revoke all on function public.complete_placement_head_provisioning(uuid,uuid) from public, anon, authenticated;
grant execute on function public.complete_placement_head_provisioning(uuid,uuid) to service_role;

commit;

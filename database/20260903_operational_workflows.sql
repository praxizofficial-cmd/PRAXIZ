begin;

-- Small, assignment-bound record used by both coordinator and HTE feedback.
-- Visibility follows the existing assignment authorization function, so this
-- does not introduce a parallel scope model.
create table if not exists public.internship_feedback (
  id uuid primary key default gen_random_uuid(),
  internship_assignment_id uuid not null references public.internship_assignments(id) on update cascade on delete restrict,
  author_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  subject text not null check (length(trim(subject)) between 3 and 160),
  message text not null check (length(trim(message)) between 3 and 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists internship_feedback_assignment_idx
  on public.internship_feedback(internship_assignment_id, created_at desc)
  where deleted_at is null;

alter table public.internship_feedback enable row level security;

drop policy if exists internship_feedback_visible_by_assignment on public.internship_feedback;
create policy internship_feedback_visible_by_assignment
on public.internship_feedback
for select
to authenticated
using (deleted_at is null and private.can_view_assignment(internship_assignment_id));

drop trigger if exists audit_internship_feedback on public.internship_feedback;
create trigger audit_internship_feedback
after insert or update or delete on public.internship_feedback
for each row execute function private.write_audit_log();

revoke all on public.internship_feedback from public, anon;
grant select on public.internship_feedback to authenticated;

create or replace function public.create_internship_feedback(
  p_assignment_id uuid,
  p_subject text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_feedback_id uuid;
begin
  if nullif(trim(p_subject), '') is null or length(trim(p_subject)) < 3 then
    raise exception 'Enter a feedback subject of at least 3 characters';
  end if;
  if nullif(trim(p_message), '') is null or length(trim(p_message)) < 3 then
    raise exception 'Enter feedback of at least 3 characters';
  end if;
  if not exists (
    select 1
    from public.internship_assignments assignment
    where assignment.id = p_assignment_id
      and assignment.deleted_at is null
      and (
        private.can_manage_assignment(assignment.id)
        or exists (
          select 1 from public.internship_supervisors supervisor
          where supervisor.internship_assignment_id = assignment.id
            and supervisor.supervisor_user_id = (select auth.uid())
            and supervisor.deleted_at is null
            and supervisor.started_at <= timezone('utc', now())
            and (supervisor.ended_at is null or supervisor.ended_at > timezone('utc', now()))
        )
      )
  ) then
    raise exception 'You are not authorized to give feedback for this internship';
  end if;

  insert into public.internship_feedback (
    internship_assignment_id, author_user_id, subject, message
  ) values (
    p_assignment_id, (select auth.uid()), trim(p_subject), trim(p_message)
  ) returning id into v_feedback_id;
  return v_feedback_id;
end;
$function$;

revoke all on function public.create_internship_feedback(uuid, text, text) from public;
grant execute on function public.create_internship_feedback(uuid, text, text) to authenticated;

create or replace function public.create_partner_hte(
  p_name text,
  p_registration_number text,
  p_industry text,
  p_address_line text,
  p_city_municipality text,
  p_province text,
  p_contact_email text,
  p_contact_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program_id uuid;
  v_program_owner_id uuid;
  v_hte_id uuid;
begin
  select ra.scope_academic_program_id, program.owning_org_unit_id
  into v_program_id, v_program_owner_id
  from public.role_assignments ra
  join public.roles role on role.id = ra.role_id
  join public.academic_programs program on program.id = ra.scope_academic_program_id
  where ra.user_id = (select auth.uid())
    and role.code = 'internship_coordinator'
    and ra.deleted_at is null
    and ra.starts_at <= timezone('utc', now())
    and (ra.ends_at is null or ra.ends_at > timezone('utc', now()))
  limit 1;

  if v_program_id is null or not private.has_program_permission('hte-offerings:manage', v_program_owner_id, v_program_id) then
    raise exception 'You are not authorized to create partner HTE records';
  end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_address_line), '') is null then
    raise exception 'Organization name and address are required';
  end if;
  if exists (
    select 1 from public.hte_organizations hte
    where hte.deleted_at is null
      and (
        lower(trim(hte.name)) = lower(trim(p_name))
        or (nullif(trim(p_registration_number), '') is not null and lower(trim(hte.registration_number)) = lower(trim(p_registration_number)))
      )
  ) then
    raise exception 'An HTE with this name or registration number already exists';
  end if;

  insert into public.hte_organizations (
    name, registration_number, industry, address_line, city_municipality,
    province, country_code, contact_email, contact_phone, verification_status,
    metadata
  ) values (
    trim(p_name), nullif(trim(p_registration_number), ''), nullif(trim(p_industry), ''),
    trim(p_address_line), nullif(trim(p_city_municipality), ''), nullif(trim(p_province), ''),
    'PH', nullif(lower(trim(p_contact_email)), ''), nullif(trim(p_contact_phone), ''),
    'pending', jsonb_build_object('submitted_by_program_id', v_program_id, 'submitted_by_user_id', (select auth.uid()))
  ) returning id into v_hte_id;
  return v_hte_id;
end;
$function$;

revoke all on function public.create_partner_hte(text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_partner_hte(text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.review_hte_organization(
  p_hte_id uuid,
  p_decision text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.has_any_permission('users:manage') then
    raise exception 'You are not authorized to verify HTE organizations';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'HTE review decision must be verified or rejected';
  end if;
  if p_decision = 'rejected' and nullif(trim(p_notes), '') is null then
    raise exception 'A reason is required when rejecting an HTE';
  end if;
  update public.hte_organizations
  set verification_status = p_decision,
      verified_by_user_id = case when p_decision = 'verified' then (select auth.uid()) else null end,
      verified_at = case when p_decision = 'verified' then timezone('utc', now()) else null end,
      verification_notes = nullif(trim(p_notes), ''),
      updated_at = timezone('utc', now())
  where id = p_hte_id and deleted_at is null and verification_status = 'pending';
  if not found then raise exception 'The pending HTE record no longer exists or has already been reviewed'; end if;
end;
$function$;

revoke all on function public.review_hte_organization(uuid, text, text) from public;
grant execute on function public.review_hte_organization(uuid, text, text) to authenticated;

create or replace function public.get_coordinator_assignment_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_program_id uuid;
  v_program_owner_id uuid;
  v_result jsonb;
begin
  select ra.scope_academic_program_id, program.owning_org_unit_id
  into v_program_id, v_program_owner_id
  from public.role_assignments ra
  join public.roles role on role.id = ra.role_id
  join public.academic_programs program on program.id = ra.scope_academic_program_id
  where ra.user_id = (select auth.uid())
    and role.code = 'internship_coordinator'
    and ra.deleted_at is null
    and ra.starts_at <= timezone('utc', now())
    and (ra.ends_at is null or ra.ends_at > timezone('utc', now()))
  limit 1;
  if v_program_id is null or not private.has_program_permission('internships:manage', v_program_owner_id, v_program_id) then
    raise exception 'You are not authorized to create internship assignments';
  end if;

  select jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', student.user_id,
        'label', concat_ws(' · ', coalesce(nullif(trim(profile.preferred_name), ''), trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name))), student.student_number)
      ) order by profile.last_name, profile.first_name)
      from public.student_profiles student
      join public.profiles profile on profile.id = student.user_id
      where student.academic_program_id = v_program_id
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
  select ra.scope_academic_program_id, program.owning_org_unit_id
  into v_program_id, v_program_owner_id
  from public.role_assignments ra
  join public.roles role on role.id = ra.role_id
  join public.academic_programs program on program.id = ra.scope_academic_program_id
  where ra.user_id = (select auth.uid())
    and role.code = 'internship_coordinator'
    and ra.deleted_at is null
    and ra.starts_at <= timezone('utc', now())
    and (ra.ends_at is null or ra.ends_at > timezone('utc', now()))
  limit 1;
  if v_program_id is null or not private.has_program_permission('internships:manage', v_program_owner_id, v_program_id) then
    raise exception 'You are not authorized to create internship assignments';
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

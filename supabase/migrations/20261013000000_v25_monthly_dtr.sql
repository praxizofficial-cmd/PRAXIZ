begin;

-- V25 adds a monthly document/version layer over the existing immutable
-- attendance events. It does not copy or make attendance timestamps editable.
create table if not exists public.monthly_dtr_reports (
  id uuid primary key default gen_random_uuid(),
  internship_assignment_id uuid not null references public.internship_assignments(id) on update cascade on delete restrict,
  reporting_month date not null,
  version_number integer not null check (version_number > 0),
  report_reference text not null unique,
  verification_status text not null default 'provisional'
    check (verification_status in ('provisional','under_review','needs_correction','verified')),
  attendance_snapshot jsonb not null,
  snapshot_hash text not null,
  verification_remarks text,
  finalized_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  finalized_at timestamptz,
  supersedes_report_id uuid references public.monthly_dtr_reports(id) on update cascade on delete restrict,
  revision_reason text,
  created_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (internship_assignment_id, reporting_month, version_number),
  check (date_trunc('month', reporting_month)::date = reporting_month),
  check (
    (verification_status = 'verified' and finalized_by_user_id is not null and finalized_at is not null)
    or verification_status <> 'verified'
  )
);

create table if not exists public.monthly_dtr_submissions (
  id uuid primary key default gen_random_uuid(),
  monthly_dtr_report_id uuid not null references public.monthly_dtr_reports(id) on update cascade on delete restrict,
  recipient_coordinator_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  submitted_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict default auth.uid(),
  submitted_by_role text not null check (submitted_by_role in ('Student Intern','HTE Representative')),
  status text not null default 'submitted' check (status in ('submitted','superseded')),
  submitted_at timestamptz not null default timezone('utc', now()),
  superseded_at timestamptz,
  unique (monthly_dtr_report_id, recipient_coordinator_user_id)
);

create index if not exists monthly_dtr_reports_assignment_month_idx
  on public.monthly_dtr_reports(internship_assignment_id, reporting_month, version_number desc);
create index if not exists monthly_dtr_reports_status_idx
  on public.monthly_dtr_reports(verification_status, reporting_month desc);
create index if not exists monthly_dtr_submissions_recipient_idx
  on public.monthly_dtr_submissions(recipient_coordinator_user_id, submitted_at desc);

alter table public.monthly_dtr_reports enable row level security;
alter table public.monthly_dtr_submissions enable row level security;

create or replace function private.can_access_monthly_dtr_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.internship_assignments assignment
    where assignment.id = p_assignment_id
      and assignment.deleted_at is null
      and (
        private.user_has_role_code(auth.uid(), 'system_admin')
        or assignment.student_user_id = auth.uid()
        or exists (
          select 1
          from public.hte_representatives representative
          where representative.user_id = auth.uid()
            and representative.hte_id = assignment.hte_id
            and representative.deleted_at is null
            and (representative.starts_on is null or representative.starts_on <= (timezone('Asia/Manila', now()))::date)
            and (representative.ends_on is null or representative.ends_on >= (timezone('Asia/Manila', now()))::date)
        )
        or exists (
          select 1
          from public.internship_supervisors supervisor
          where supervisor.internship_assignment_id = assignment.id
            and supervisor.supervisor_user_id = auth.uid()
            and supervisor.supervisor_type = 'coordinator'
            and supervisor.deleted_at is null
            and supervisor.started_at <= timezone('utc', now())
            and (supervisor.ended_at is null or supervisor.ended_at > timezone('utc', now()))
        )
      )
  );
$function$;

create or replace function private.can_verify_monthly_dtr_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.internship_assignments assignment
    join public.hte_representatives representative
      on representative.hte_id = assignment.hte_id
     and representative.user_id = auth.uid()
     and representative.deleted_at is null
    where assignment.id = p_assignment_id
      and assignment.deleted_at is null
      and private.user_has_role_code(auth.uid(), 'hte_supervisor')
      and (representative.starts_on is null or representative.starts_on <= (timezone('Asia/Manila', now()))::date)
      and (representative.ends_on is null or representative.ends_on >= (timezone('Asia/Manila', now()))::date)
  );
$function$;

drop policy if exists monthly_dtr_reports_read on public.monthly_dtr_reports;
create policy monthly_dtr_reports_read on public.monthly_dtr_reports
for select to authenticated
using (private.can_access_monthly_dtr_assignment(internship_assignment_id));

drop policy if exists monthly_dtr_submissions_read on public.monthly_dtr_submissions;
create policy monthly_dtr_submissions_read on public.monthly_dtr_submissions
for select to authenticated
using (
  recipient_coordinator_user_id = auth.uid()
  or exists (
    select 1 from public.monthly_dtr_reports report
    where report.id = monthly_dtr_report_id
      and private.can_access_monthly_dtr_assignment(report.internship_assignment_id)
  )
);

revoke insert, update, delete on public.monthly_dtr_reports from authenticated;
revoke insert, update, delete on public.monthly_dtr_submissions from authenticated;
grant select on public.monthly_dtr_reports, public.monthly_dtr_submissions to authenticated;

create or replace function private.build_monthly_dtr_snapshot(
  p_assignment_id uuid,
  p_reporting_month date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with assignment_context as (
    select assignment.id,
      assignment.student_user_id,
      assignment.required_hours,
      assignment.daily_required_hours_snapshot,
      coalesce(nullif(trim(profile.preferred_name), ''), trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name))) as student_name,
      coalesce(student.student_number, '') as student_number,
      coalesce(campus.short_name, campus.name, '') as campus_name,
      coalesce(unit.short_name, unit.name, '') as academic_unit_name,
      concat_ws(' - ', program.code, program.name) as program_name,
      coalesce(student.section, '') as section,
      coalesce(hte.trade_name, hte.name, '') as hte_name,
      coalesce(year.label, '') as academic_year,
      case term.term
        when 'first_semester' then '1st Semester'
        when 'second_semester' then '2nd Semester'
        when 'midyear' then 'Midyear'
        else initcap(replace(coalesce(term.term, ''), '_', ' '))
      end as academic_term
    from public.internship_assignments assignment
    join public.profiles profile on profile.id = assignment.student_user_id and profile.deleted_at is null
    left join public.student_profiles student on student.user_id = assignment.student_user_id and student.deleted_at is null
    join public.academic_programs program on program.id = assignment.academic_program_id and program.deleted_at is null
    left join public.org_units unit on unit.id = program.owning_org_unit_id and unit.deleted_at is null
    join public.org_units campus on campus.id = assignment.campus_org_unit_id and campus.deleted_at is null
    join public.hte_organizations hte on hte.id = assignment.hte_id and hte.deleted_at is null
    left join public.academic_terms term on term.id = assignment.academic_term_id and term.deleted_at is null
    left join public.academic_years year on year.id = term.academic_year_id and year.deleted_at is null
    where assignment.id = p_assignment_id and assignment.deleted_at is null
  ), session_pairs as (
    select session.id,
      session.work_date,
      session.status,
      case
        when original.time_in_at is not null and original.time_out_at is not null
          and original.time_out_at > original.time_in_at
          and original.time_out_at - original.time_in_at <= interval '24 hours'
        then original.time_in_at
        else correction.requested_time_in
      end as time_in_at,
      case
        when original.time_in_at is not null and original.time_out_at is not null
          and original.time_out_at > original.time_in_at
          and original.time_out_at - original.time_in_at <= interval '24 hours'
        then original.time_out_at
        else correction.requested_time_out
      end as time_out_at,
      private.calculate_attendance_minutes(session.id) as recorded_minutes,
      case when verification.decision = 'verified' then verification.verified_minutes end as verified_minutes,
      verification.remarks,
      case when verification.reviewer_user_id is null then null
        else coalesce(nullif(trim(reviewer.preferred_name), ''), trim(concat_ws(' ', reviewer.first_name, reviewer.middle_name, reviewer.last_name)))
      end as verified_by
    from public.attendance_sessions session
    left join lateral (
      select
        min(event.occurred_at) filter (where event.event_type = 'time_in') as time_in_at,
        max(event.occurred_at) filter (where event.event_type = 'time_out') as time_out_at
      from public.attendance_events event
      where event.attendance_session_id = session.id
    ) original on true
    left join lateral (
      select requested_time_in, requested_time_out
      from public.attendance_corrections item
      where item.attendance_session_id = session.id and item.status = 'approved'
      order by item.reviewed_at desc nulls last, item.created_at desc
      limit 1
    ) correction on true
    left join lateral (
      select item.reviewer_user_id, item.decision, item.verified_minutes, item.remarks
      from public.attendance_verifications item
      where item.attendance_session_id = session.id
      order by item.created_at desc
      limit 1
    ) verification on true
    left join public.profiles reviewer on reviewer.id = verification.reviewer_user_id and reviewer.deleted_at is null
    where session.internship_assignment_id = p_assignment_id
      and session.deleted_at is null
      and session.work_date >= p_reporting_month
      and session.work_date < (p_reporting_month + interval '1 month')::date
      and session.status <> 'voided'
  ), sessions_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'sessionId', pair.id,
      'workDate', pair.work_date,
      'timeInAt', pair.time_in_at,
      'timeOutAt', pair.time_out_at,
      'recordedMinutes', pair.recorded_minutes,
      'verifiedMinutes', pair.verified_minutes,
      'status', pair.status,
      'verificationRemarks', pair.remarks,
      'verifiedBy', pair.verified_by
    ) order by pair.work_date, pair.time_in_at nulls last), '[]'::jsonb) as sessions,
      coalesce(sum(pair.recorded_minutes), 0)::integer as recorded_minutes,
      coalesce(sum(pair.verified_minutes), 0)::integer as verified_minutes,
      count(*)::integer as recorded_sessions,
      count(*) filter (where pair.status = 'verified' and pair.verified_minutes is not null)::integer as verified_sessions,
      count(*) filter (where pair.status <> 'verified' or pair.time_out_at is null or pair.verified_minutes is null)::integer as exception_count
    from session_pairs pair
  )
  select jsonb_build_object(
    'assignmentId', context.id,
    'reportingMonth', p_reporting_month,
    'generatedAt', timezone('utc', now()),
    'student', jsonb_build_object(
      'name', context.student_name,
      'studentNumber', context.student_number,
      'campus', context.campus_name,
      'academicUnit', context.academic_unit_name,
      'program', context.program_name,
      'section', context.section
    ),
    'internship', jsonb_build_object(
      'hte', context.hte_name,
      'academicYear', context.academic_year,
      'academicTerm', context.academic_term,
      'requiredHours', context.required_hours,
      'dailyRequiredHours', context.daily_required_hours_snapshot
    ),
    'sessions', sessions.sessions,
    'totals', jsonb_build_object(
      'recordedMinutes', sessions.recorded_minutes,
      'verifiedMinutes', sessions.verified_minutes,
      'recordedSessions', sessions.recorded_sessions,
      'verifiedSessions', sessions.verified_sessions,
      'exceptionCount', sessions.exception_count
    )
  )
  from assignment_context context cross join sessions_json sessions;
$function$;

create or replace function private.monthly_dtr_response(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select report.attendance_snapshot || jsonb_build_object(
    'reportId', report.id,
    'reportReference', report.report_reference,
    'version', report.version_number,
    'verificationStatus', report.verification_status,
    'submissionStatus', case
      when exists (select 1 from public.monthly_dtr_submissions submission where submission.monthly_dtr_report_id = report.id and submission.status = 'submitted') then 'submitted'
      when exists (select 1 from public.monthly_dtr_submissions submission where submission.monthly_dtr_report_id = report.id and submission.status = 'superseded') then 'superseded'
      else 'not_submitted'
    end,
    'finalizedAt', report.finalized_at,
    'finalizedBy', case when report.finalized_by_user_id is null then null
      else coalesce(nullif(trim(finalizer.preferred_name), ''), trim(concat_ws(' ', finalizer.first_name, finalizer.middle_name, finalizer.last_name))) end,
    'verificationRemarks', report.verification_remarks
  )
  from public.monthly_dtr_reports report
  left join public.profiles finalizer on finalizer.id = report.finalized_by_user_id
  where report.id = p_report_id;
$function$;

create or replace function public.list_monthly_dtr_assignments()
returns table (
  assignment_id uuid,
  student_name text,
  student_number text,
  hte_name text,
  program_name text,
  assignment_status text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select assignment.id,
    coalesce(nullif(trim(profile.preferred_name), ''), trim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name))),
    coalesce(student.student_number, ''),
    coalesce(hte.trade_name, hte.name),
    concat_ws(' - ', program.code, program.name),
    assignment.status
  from public.internship_assignments assignment
  join public.profiles profile on profile.id = assignment.student_user_id and profile.deleted_at is null
  left join public.student_profiles student on student.user_id = assignment.student_user_id and student.deleted_at is null
  join public.hte_organizations hte on hte.id = assignment.hte_id and hte.deleted_at is null
  join public.academic_programs program on program.id = assignment.academic_program_id and program.deleted_at is null
  where assignment.deleted_at is null
    and assignment.status in ('active','completed')
    and private.can_access_monthly_dtr_assignment(assignment.id)
  order by profile.last_name, profile.first_name, assignment.created_at desc;
$function$;

create or replace function public.get_monthly_dtr_report(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_assignment_id uuid;
begin
  select report.internship_assignment_id into v_assignment_id
  from public.monthly_dtr_reports report where report.id = p_report_id;
  if v_assignment_id is null or not private.can_access_monthly_dtr_assignment(v_assignment_id) then
    raise exception 'This monthly DTR is not available to your account';
  end if;
  return private.monthly_dtr_response(p_report_id);
end;
$function$;

create or replace function public.prepare_monthly_dtr(
  p_assignment_id uuid,
  p_reporting_month date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_report public.monthly_dtr_reports%rowtype;
  v_snapshot jsonb;
  v_version integer;
  v_reference text;
begin
  if p_reporting_month <> date_trunc('month', p_reporting_month)::date then
    raise exception 'Select the first day of a calendar reporting month';
  end if;
  if not private.can_access_monthly_dtr_assignment(p_assignment_id) then
    raise exception 'You are not authorized to prepare this monthly DTR';
  end if;
  v_snapshot := private.build_monthly_dtr_snapshot(p_assignment_id, p_reporting_month);
  if v_snapshot is null then raise exception 'The internship assignment could not be resolved'; end if;

  select report.* into v_report
  from public.monthly_dtr_reports report
  where report.internship_assignment_id = p_assignment_id and report.reporting_month = p_reporting_month
  order by report.version_number desc limit 1 for update;

  if v_report.id is not null and v_report.verification_status = 'verified' then
    return private.monthly_dtr_response(v_report.id);
  elsif v_report.id is not null then
    update public.monthly_dtr_reports
    set attendance_snapshot = v_snapshot,
        snapshot_hash = md5(v_snapshot::text),
        updated_at = timezone('utc', now())
    where id = v_report.id;
    return private.monthly_dtr_response(v_report.id);
  end if;

  select coalesce(max(report.version_number), 0) + 1 into v_version
  from public.monthly_dtr_reports report
  where report.internship_assignment_id = p_assignment_id and report.reporting_month = p_reporting_month;
  v_reference := 'DTR-' || to_char(p_reporting_month, 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.monthly_dtr_reports(
    internship_assignment_id, reporting_month, version_number, report_reference,
    attendance_snapshot, snapshot_hash, created_by_user_id
  ) values (
    p_assignment_id, p_reporting_month, v_version, v_reference,
    v_snapshot, md5(v_snapshot::text), auth.uid()
  ) returning * into v_report;
  return private.monthly_dtr_response(v_report.id);
end;
$function$;

create or replace function public.finalize_monthly_dtr(
  p_report_id uuid,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_report public.monthly_dtr_reports%rowtype;
  v_snapshot jsonb;
  v_session jsonb;
begin
  select report.* into v_report from public.monthly_dtr_reports report where report.id = p_report_id for update;
  if v_report.id is null then raise exception 'The monthly DTR was not found'; end if;
  if not private.can_verify_monthly_dtr_assignment(v_report.internship_assignment_id) then
    raise exception 'Only an authorized HTE Representative may finalize this monthly DTR';
  end if;
  if v_report.verification_status = 'verified' then return private.monthly_dtr_response(v_report.id); end if;

  v_snapshot := private.build_monthly_dtr_snapshot(v_report.internship_assignment_id, v_report.reporting_month);
  if jsonb_array_length(coalesce(v_snapshot->'sessions', '[]'::jsonb)) = 0 then
    raise exception 'A monthly DTR cannot be finalized without recorded attendance sessions';
  end if;
  for v_session in select value from jsonb_array_elements(v_snapshot->'sessions') loop
    if v_session->>'status' <> 'verified'
      or nullif(v_session->>'timeInAt', '') is null
      or nullif(v_session->>'timeOutAt', '') is null
      or (v_session->>'verifiedMinutes') is null then
      raise exception 'Resolve every incomplete, pending, flagged, or rejected session before monthly finalization';
    end if;
  end loop;

  update public.monthly_dtr_reports
  set attendance_snapshot = v_snapshot,
      snapshot_hash = md5(v_snapshot::text),
      verification_status = 'verified',
      verification_remarks = nullif(trim(coalesce(p_remarks, '')), ''),
      finalized_by_user_id = auth.uid(),
      finalized_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_report.id;
  return private.monthly_dtr_response(v_report.id);
end;
$function$;

create or replace function public.request_monthly_dtr_correction(
  p_report_id uuid,
  p_remarks text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_report public.monthly_dtr_reports%rowtype;
begin
  if nullif(trim(coalesce(p_remarks, '')), '') is null then raise exception 'Correction feedback is required'; end if;
  select report.* into v_report from public.monthly_dtr_reports report where report.id = p_report_id for update;
  if v_report.id is null then raise exception 'The monthly DTR was not found'; end if;
  if not private.can_verify_monthly_dtr_assignment(v_report.internship_assignment_id) then
    raise exception 'Only an authorized HTE Representative may request correction';
  end if;
  if v_report.verification_status = 'verified' then
    raise exception 'Create an authorized revision instead of changing a finalized monthly DTR';
  end if;
  update public.monthly_dtr_reports
  set verification_status = 'needs_correction', verification_remarks = trim(p_remarks), updated_at = timezone('utc', now())
  where id = v_report.id;
  return private.monthly_dtr_response(v_report.id);
end;
$function$;

create or replace function public.create_monthly_dtr_revision(
  p_report_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prior public.monthly_dtr_reports%rowtype;
  v_new public.monthly_dtr_reports%rowtype;
  v_snapshot jsonb;
  v_reference text;
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'An authorized revision reason is required'; end if;
  select report.* into v_prior from public.monthly_dtr_reports report where report.id = p_report_id for update;
  if v_prior.id is null or v_prior.verification_status <> 'verified' then
    raise exception 'Only a finalized monthly DTR can be revised';
  end if;
  if not private.can_verify_monthly_dtr_assignment(v_prior.internship_assignment_id)
    and not private.user_has_role_code(auth.uid(), 'system_admin') then
    raise exception 'You are not authorized to revise this monthly DTR';
  end if;
  v_snapshot := private.build_monthly_dtr_snapshot(v_prior.internship_assignment_id, v_prior.reporting_month);
  v_reference := 'DTR-' || to_char(v_prior.reporting_month, 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.monthly_dtr_reports(
    internship_assignment_id, reporting_month, version_number, report_reference,
    verification_status, attendance_snapshot, snapshot_hash, supersedes_report_id,
    revision_reason, created_by_user_id
  ) values (
    v_prior.internship_assignment_id, v_prior.reporting_month, v_prior.version_number + 1, v_reference,
    'provisional', v_snapshot, md5(v_snapshot::text), v_prior.id,
    trim(p_reason), auth.uid()
  ) returning * into v_new;
  return private.monthly_dtr_response(v_new.id);
end;
$function$;

create or replace function public.submit_monthly_dtr(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_report public.monthly_dtr_reports%rowtype;
  v_assignment public.internship_assignments%rowtype;
  v_recipient uuid;
  v_submission public.monthly_dtr_submissions%rowtype;
  v_actor_role text;
  v_created boolean := false;
  v_notification_id uuid;
begin
  select report.* into v_report from public.monthly_dtr_reports report where report.id = p_report_id for update;
  if v_report.id is null or v_report.verification_status <> 'verified' then
    raise exception 'Only an HTE-verified monthly DTR can be submitted';
  end if;
  select assignment.* into v_assignment from public.internship_assignments assignment
  where assignment.id = v_report.internship_assignment_id and assignment.deleted_at is null;
  if v_assignment.student_user_id = auth.uid() and private.user_has_role_code(auth.uid(), 'student_intern') then
    v_actor_role := 'Student Intern';
  elsif private.can_verify_monthly_dtr_assignment(v_assignment.id) then
    v_actor_role := 'HTE Representative';
  else
    raise exception 'You are not authorized to submit this monthly DTR';
  end if;

  select supervisor.supervisor_user_id into v_recipient
  from public.internship_supervisors supervisor
  where supervisor.internship_assignment_id = v_assignment.id
    and supervisor.supervisor_type = 'coordinator'
    and supervisor.deleted_at is null
    and supervisor.started_at <= timezone('utc', now())
    and (supervisor.ended_at is null or supervisor.ended_at > timezone('utc', now()))
  order by supervisor.is_primary desc, supervisor.started_at desc
  limit 1;
  if v_recipient is null then raise exception 'The authorized Internship Coordinator could not be resolved'; end if;

  insert into public.monthly_dtr_submissions(
    monthly_dtr_report_id, recipient_coordinator_user_id,
    submitted_by_user_id, submitted_by_role
  ) values (v_report.id, v_recipient, auth.uid(), v_actor_role)
  on conflict (monthly_dtr_report_id, recipient_coordinator_user_id) do nothing
  returning * into v_submission;
  if v_submission.id is null then
    select submission.* into v_submission
    from public.monthly_dtr_submissions submission
    where submission.monthly_dtr_report_id = v_report.id
      and submission.recipient_coordinator_user_id = v_recipient;
  else
    v_created := true;
    update public.monthly_dtr_submissions submission
    set status = 'superseded', superseded_at = timezone('utc', now())
    from public.monthly_dtr_reports prior
    where submission.monthly_dtr_report_id = prior.id
      and prior.internship_assignment_id = v_report.internship_assignment_id
      and prior.reporting_month = v_report.reporting_month
      and prior.version_number < v_report.version_number
      and submission.status = 'submitted';

    begin
      insert into public.notifications(
        deduplication_key, type, title, message, severity, actor_user_id,
        internship_assignment_id, related_entity_type, related_entity_id, metadata
      ) values (
        'monthly-dtr-submission:' || v_submission.id::text,
        'monthly_dtr.submitted',
        'Verified monthly DTR received',
        (v_report.attendance_snapshot->'student'->>'name') || ' submitted ' || to_char(v_report.reporting_month, 'FMMonth YYYY') || ' DTR, version ' || v_report.version_number::text || '.',
        'info', auth.uid(), v_report.internship_assignment_id,
        'internship_assignment', v_report.internship_assignment_id,
        jsonb_build_object(
          'targetPath', '/coordinator/attendance?dtr=' || v_report.id::text,
          'monthlyDtrReportId', v_report.id,
          'monthlyDtrSubmissionId', v_submission.id
        )
      ) returning id into v_notification_id;
      insert into public.notification_recipients(notification_id, user_id)
      values (v_notification_id, v_recipient)
      on conflict (notification_id, user_id) do nothing;
    exception when others then
      raise warning 'Monthly DTR % was submitted but its notification could not be delivered', v_report.id;
    end;
  end if;

  return jsonb_build_object(
    'id', v_submission.id,
    'created', v_created,
    'status', v_submission.status,
    'submittedAt', v_submission.submitted_at,
    'submittedByRole', v_submission.submitted_by_role,
    'recipientCoordinatorUserId', v_submission.recipient_coordinator_user_id
  );
end;
$function$;

create or replace function public.list_monthly_dtr_reports(p_reporting_month date default null)
returns table (report jsonb)
language sql
stable
security definer
set search_path = ''
as $function$
  select private.monthly_dtr_response(item.id)
  from public.monthly_dtr_reports item
  where (p_reporting_month is null or item.reporting_month = p_reporting_month)
    and private.can_access_monthly_dtr_assignment(item.internship_assignment_id)
  order by item.reporting_month desc, item.version_number desc, item.updated_at desc;
$function$;

-- Bulk assignment creation remains an all-or-nothing wrapper around the
-- existing, individually authorized assignment RPC. Every student therefore
-- receives the same duplicate, scope, HTE, term, and snapshot checks as the
-- established one-student workflow.
create or replace function public.create_coordinator_assignments_bulk(p_assignments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_student_id uuid;
  v_total integer;
  v_unique_students integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create internship assignments';
  end if;
  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Bulk assignments must be supplied as an array';
  end if;
  v_total := jsonb_array_length(p_assignments);
  if v_total < 2 or v_total > 50 then
    raise exception 'Select between 2 and 50 Student Interns for bulk assignment';
  end if;
  select count(distinct item->>'studentUserId') into v_unique_students
  from jsonb_array_elements(p_assignments) item;
  if v_unique_students <> v_total then
    raise exception 'Each Student Intern may appear only once in a bulk assignment';
  end if;

  for v_item in select value from jsonb_array_elements(p_assignments)
  loop
    begin
      v_student_id := (v_item->>'studentUserId')::uuid;
      perform public.create_coordinator_assignment(
        v_student_id,
        (v_item->>'hteId')::uuid,
        (v_item->>'academicTermId')::uuid,
        (v_item->>'requiredHours')::integer,
        (v_item->>'startDate')::date,
        (v_item->>'expectedEndDate')::date,
        coalesce((v_item->>'submitForApproval')::boolean, true)
      );
    exception when others then
      raise exception 'Bulk assignment failed for Student Intern %: %', coalesce(v_student_id::text, 'unknown'), SQLERRM;
    end;
  end loop;

  return jsonb_build_object(
    'createdCount', v_total,
    'studentUserIds', (
      select jsonb_agg(item->>'studentUserId' order by item->>'studentUserId')
      from jsonb_array_elements(p_assignments) item
    )
  );
end;
$function$;

revoke all on function public.list_monthly_dtr_assignments() from public, anon;
revoke all on function public.get_monthly_dtr_report(uuid) from public, anon;
revoke all on function public.prepare_monthly_dtr(uuid,date) from public, anon;
revoke all on function public.finalize_monthly_dtr(uuid,text) from public, anon;
revoke all on function public.request_monthly_dtr_correction(uuid,text) from public, anon;
revoke all on function public.create_monthly_dtr_revision(uuid,text) from public, anon;
revoke all on function public.submit_monthly_dtr(uuid) from public, anon;
revoke all on function public.list_monthly_dtr_reports(date) from public, anon;
revoke all on function public.create_coordinator_assignments_bulk(jsonb) from public, anon;
grant execute on function public.list_monthly_dtr_assignments() to authenticated;
grant execute on function public.get_monthly_dtr_report(uuid) to authenticated;
grant execute on function public.prepare_monthly_dtr(uuid,date) to authenticated;
grant execute on function public.finalize_monthly_dtr(uuid,text) to authenticated;
grant execute on function public.request_monthly_dtr_correction(uuid,text) to authenticated;
grant execute on function public.create_monthly_dtr_revision(uuid,text) to authenticated;
grant execute on function public.submit_monthly_dtr(uuid) to authenticated;
grant execute on function public.list_monthly_dtr_reports(date) to authenticated;
grant execute on function public.create_coordinator_assignments_bulk(jsonb) to authenticated;

drop trigger if exists audit_monthly_dtr_reports on public.monthly_dtr_reports;
create trigger audit_monthly_dtr_reports
after insert or update on public.monthly_dtr_reports
for each row execute function private.write_audit_log();
drop trigger if exists audit_monthly_dtr_submissions on public.monthly_dtr_submissions;
create trigger audit_monthly_dtr_submissions
after insert or update on public.monthly_dtr_submissions
for each row execute function private.write_audit_log();

commit;

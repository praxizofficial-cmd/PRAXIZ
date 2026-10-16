begin;

-- Preserve immutable events and review history while making every new review
-- use one canonical, minute-precision calculation. The rounding happens once,
-- after subtracting the authoritative timestamps; decimal hours are never used.
create or replace function private.calculate_attendance_minutes(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  with original_pair as (
    select
      min(event.occurred_at) filter (where event.event_type = 'time_in') as time_in_at,
      max(event.occurred_at) filter (where event.event_type = 'time_out') as time_out_at
    from public.attendance_events event
    where event.attendance_session_id = p_session_id
  ), approved_correction as (
    select correction.requested_time_in as time_in_at,
      correction.requested_time_out as time_out_at
    from public.attendance_corrections correction
    where correction.attendance_session_id = p_session_id
      and correction.status = 'approved'
    order by correction.reviewed_at desc nulls last, correction.created_at desc
    limit 1
  ), resolved as (
    select 1 as priority, time_in_at, time_out_at from original_pair
    union all
    select 2 as priority, time_in_at, time_out_at from approved_correction
  )
  select greatest(
    1,
    round(extract(epoch from (time_out_at - time_in_at)) / 60.0)::integer
  )
  from resolved
  where time_in_at is not null
    and time_out_at is not null
    and time_out_at > time_in_at
    and time_out_at - time_in_at <= interval '24 hours'
  order by priority
  limit 1;
$function$;

comment on function private.calculate_attendance_minutes(uuid) is
  'Returns whole minutes from one complete authoritative pair (earliest immutable Time In and latest immutable Time Out, otherwise the latest approved correction). Elapsed seconds are rounded once at the display/credit boundary; pairs are never mixed.';

-- This security-invoker view keeps the existing base-table RLS authoritative.
-- It is deliberately separate from assignment_progress so document, log, and
-- evaluation metrics are not rebuilt or placed at risk by the attendance fix.
create or replace view public.assignment_attendance_progress_v28
with (security_invoker = true)
as
with visible_assignments as (
  select assignment.id as internship_assignment_id
  from public.internship_assignments assignment
  where assignment.deleted_at is null
), session_base as (
  select session.id,
    session.internship_assignment_id,
    session.status,
    original.time_in_at as original_time_in,
    original.time_out_at as original_time_out,
    correction.requested_time_in as corrected_time_in,
    correction.requested_time_out as corrected_time_out,
    verification.decision
  from visible_assignments assignment
  left join public.attendance_sessions session
    on session.internship_assignment_id = assignment.internship_assignment_id
   and session.deleted_at is null
   and session.status <> 'voided'
  left join lateral (
    select min(event.occurred_at) filter (where event.event_type = 'time_in') as time_in_at,
      max(event.occurred_at) filter (where event.event_type = 'time_out') as time_out_at
    from public.attendance_events event
    where event.attendance_session_id = session.id
  ) original on true
  left join lateral (
    select item.requested_time_in, item.requested_time_out
    from public.attendance_corrections item
    where item.attendance_session_id = session.id and item.status = 'approved'
    order by item.reviewed_at desc nulls last, item.created_at desc
    limit 1
  ) correction on true
  left join lateral (
    select item.decision
    from public.attendance_verifications item
    where item.attendance_session_id = session.id
    order by item.created_at desc
    limit 1
  ) verification on true
), resolved as (
  select base.*,
    case
      when base.original_time_in is not null
       and base.original_time_out is not null
       and base.original_time_out > base.original_time_in
       and base.original_time_out - base.original_time_in <= interval '24 hours'
      then base.original_time_in
      else base.corrected_time_in
    end as time_in_at,
    case
      when base.original_time_in is not null
       and base.original_time_out is not null
       and base.original_time_out > base.original_time_in
       and base.original_time_out - base.original_time_in <= interval '24 hours'
      then base.original_time_out
      else base.corrected_time_out
    end as time_out_at
  from session_base base
), valid_verified_intervals as (
  select *
  from resolved
  where id is not null
    and status = 'verified'
    and decision = 'verified'
    and time_in_at is not null
    and time_out_at is not null
    and time_out_at > time_in_at
    and time_out_at - time_in_at <= interval '24 hours'
), ordered_intervals as (
  select item.*,
    max(time_out_at) over (
      partition by internship_assignment_id
      order by time_in_at, time_out_at, id
      rows between unbounded preceding and 1 preceding
    ) as prior_max_time_out
  from valid_verified_intervals item
), marked_intervals as (
  select item.*,
    case when prior_max_time_out is null or time_in_at > prior_max_time_out then 1 else 0 end as starts_island
  from ordered_intervals item
), islanded_intervals as (
  select item.*,
    sum(starts_island) over (
      partition by internship_assignment_id
      order by time_in_at, time_out_at, id
      rows unbounded preceding
    ) as island_number
  from marked_intervals item
), merged_intervals as (
  select internship_assignment_id, island_number,
    min(time_in_at) as time_in_at,
    max(time_out_at) as time_out_at
  from islanded_intervals
  group by internship_assignment_id, island_number
), credited as (
  select internship_assignment_id,
    greatest(
      1,
      round(sum(extract(epoch from (time_out_at - time_in_at))) / 60.0)::integer
    ) as verified_minutes
  from merged_intervals
  group by internship_assignment_id
), session_counts as (
  select assignment.internship_assignment_id,
    count(base.id)::integer as total_sessions,
    count(base.id) filter (
      where base.status = 'verified'
        and base.decision = 'verified'
        and base.time_in_at is not null
        and base.time_out_at is not null
        and base.time_out_at > base.time_in_at
        and base.time_out_at - base.time_in_at <= interval '24 hours'
    )::integer as verified_sessions
  from visible_assignments assignment
  left join resolved base
    on base.internship_assignment_id = assignment.internship_assignment_id
  group by assignment.internship_assignment_id
)
select counts.internship_assignment_id,
  coalesce(credited.verified_minutes, 0)::integer as verified_minutes,
  round(coalesce(credited.verified_minutes, 0)::numeric / 60.0, 2) as rendered_hours,
  counts.total_sessions,
  counts.verified_sessions,
  case when counts.total_sessions = 0 then 0::numeric
    else round((counts.verified_sessions::numeric / counts.total_sessions::numeric) * 100.0, 2)
  end as attendance_verification_percent
from session_counts counts
left join credited using (internship_assignment_id);

revoke all on public.assignment_attendance_progress_v28 from public, anon;
grant select on public.assignment_attendance_progress_v28 to authenticated;

-- New and regenerated DTR snapshots calculate credited minutes from the same
-- canonical pair. Existing finalized snapshots stay frozen and auditable.
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
      case when verification.decision = 'verified'
        then private.calculate_attendance_minutes(session.id)
      end as verified_minutes,
      verification.remarks,
      case when verification.reviewer_user_id is null then null
        else coalesce(nullif(trim(reviewer.preferred_name), ''), trim(concat_ws(' ', reviewer.first_name, reviewer.middle_name, reviewer.last_name)))
      end as verified_by
    from public.attendance_sessions session
    left join lateral (
      select min(event.occurred_at) filter (where event.event_type = 'time_in') as time_in_at,
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
      select item.reviewer_user_id, item.decision, item.remarks
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

commit;

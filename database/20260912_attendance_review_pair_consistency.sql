begin;

create or replace function private.calculate_attendance_minutes(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with original_pair as (
    select
      private.attendance_event_timestamp(p_session_id, 'time_in') as time_in_at,
      private.attendance_event_timestamp(p_session_id, 'time_out') as time_out_at
  ),
  approved_correction as (
    select ac.requested_time_in as time_in_at, ac.requested_time_out as time_out_at
    from public.attendance_corrections ac
    where ac.attendance_session_id = p_session_id
      and ac.status = 'approved'
    order by ac.reviewed_at desc nulls last, ac.created_at desc
    limit 1
  ),
  resolved as (
    select 1 as priority, time_in_at, time_out_at from original_pair
    union all
    select 2 as priority, time_in_at, time_out_at from approved_correction
  )
  select greatest(
    1,
    floor(extract(epoch from (time_out_at - time_in_at)) / 60)::integer
  )
  from resolved
  where time_in_at is not null
    and time_out_at is not null
    and time_out_at > time_in_at
    and time_out_at - time_in_at <= interval '24 hours'
  order by priority
  limit 1;
$$;

comment on function private.calculate_attendance_minutes(uuid) is
  'Returns minutes from one complete authoritative pair: original events first, otherwise the latest approved correction. Valid sub-minute sessions count as one minute; pairs are never mixed.';

create or replace function public.review_attendance_session(
  p_session_id uuid,
  p_decision text,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.attendance_sessions%rowtype;
  verification public.attendance_verifications%rowtype;
  calculated_minutes integer;
begin
  if p_decision not in ('verified', 'flagged', 'rejected') then
    raise exception 'Attendance decision must be verified, flagged, or rejected';
  end if;

  select ats.*
  into session
  from public.attendance_sessions ats
  where ats.id = p_session_id
    and ats.deleted_at is null
  for update;

  if session.id is null then
    raise exception 'The attendance session was not found';
  end if;
  if not private.can_verify_attendance_session(session.id) then
    raise exception 'You are not authorized to verify this attendance session';
  end if;
  if session.status = 'verified' then
    raise exception 'This attendance session has already been verified';
  elsif session.status = 'rejected' then
    raise exception 'This attendance session has already been rejected';
  elsif session.status = 'voided' then
    raise exception 'A voided attendance session cannot be reviewed';
  elsif session.status = 'open' then
    raise exception 'This attendance session is still active';
  elsif session.status not in ('pending_verification', 'flagged') then
    raise exception 'This attendance session is not available for review';
  end if;

  if p_decision = 'verified' then
    if exists (
      select 1
      from public.attendance_corrections ac
      where ac.attendance_session_id = session.id
        and ac.status = 'pending'
    ) then
      raise exception 'A pending correction must be reviewed first';
    end if;

    calculated_minutes := private.calculate_attendance_minutes(session.id);
    if calculated_minutes is null or calculated_minutes <= 0 then
      raise exception 'A complete original or approved corrected time pair is required';
    end if;
  elsif nullif(trim(p_remarks), '') is null then
    raise exception 'Remarks are required when flagging or rejecting attendance';
  end if;

  insert into public.attendance_verifications (
    attendance_session_id,
    reviewer_user_id,
    decision,
    verified_minutes,
    remarks
  )
  values (
    session.id,
    auth.uid(),
    p_decision,
    case when p_decision = 'verified' then calculated_minutes else null end,
    nullif(trim(p_remarks), '')
  )
  returning * into verification;

  update public.attendance_sessions
  set status = p_decision
  where id = session.id;

  return jsonb_build_object(
    'id', verification.id,
    'session_id', session.id,
    'decision', verification.decision,
    'verified_minutes', verification.verified_minutes
  );
end;
$$;

comment on function public.review_attendance_session(uuid, text, text) is
  'Locks and rechecks the current attendance state, preserves scope authorization, and applies Verify, Flag, or Reject using one canonical attendance pair.';

commit;

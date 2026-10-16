-- PRAXIZ v27: transactional Student document withdrawal.
-- Historical submissions and private files are retained. A withdrawal only
-- removes the still-unreviewed version from the requirement's current slot.

alter table public.document_submissions
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  add column if not exists withdrawal_reason text;

create table if not exists public.document_submission_withdrawals (
  id uuid primary key default gen_random_uuid(),
  document_submission_id uuid not null unique references public.document_submissions(id) on update cascade on delete restrict,
  document_requirement_id uuid not null references public.document_requirements(id) on update cascade on delete restrict,
  internship_assignment_id uuid not null references public.internship_assignments(id) on update cascade on delete restrict,
  withdrawn_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  previous_requirement_status text not null,
  reason text,
  withdrawn_at timestamptz not null default now()
);

create index if not exists document_submission_withdrawals_assignment_idx
  on public.document_submission_withdrawals(internship_assignment_id, withdrawn_at desc);

alter table public.document_submission_withdrawals enable row level security;

drop policy if exists document_submission_withdrawals_read_v27 on public.document_submission_withdrawals;
create policy document_submission_withdrawals_read_v27
on public.document_submission_withdrawals for select to authenticated
using (private.can_view_assignment(internship_assignment_id));

revoke all on public.document_submission_withdrawals from public, anon, authenticated;
grant select on public.document_submission_withdrawals to authenticated;

create or replace function public.withdraw_document_submission_v27(
  p_submission_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_record record;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Sign in to withdraw a document submission';
  end if;

  select submission.id as submission_id,
         submission.document_requirement_id,
         submission.submitted_by_user_id,
         submission.withdrawn_at,
         requirement.internship_assignment_id,
         requirement.current_submission_id,
         requirement.status as requirement_status,
         requirement.due_at,
         assignment.student_user_id
  into v_record
  from public.document_submissions submission
  join public.document_requirements requirement
    on requirement.id = submission.document_requirement_id
  join public.internship_assignments assignment
    on assignment.id = requirement.internship_assignment_id
  where submission.id = p_submission_id
    and assignment.deleted_at is null
  for update of submission, requirement;

  if not found
     or v_record.student_user_id <> auth.uid()
     or v_record.submitted_by_user_id <> auth.uid() then
    raise exception 'This document submission is not available for your account';
  end if;
  if v_record.withdrawn_at is not null then
    raise exception 'This document submission has already been withdrawn';
  end if;
  if v_record.current_submission_id is distinct from p_submission_id then
    raise exception 'Only the current document submission can be withdrawn';
  end if;
  if v_record.requirement_status not in ('submitted', 'under_review') then
    raise exception 'This document submission can no longer be withdrawn';
  end if;
  if v_record.due_at is null then
    raise exception 'Withdrawal is unavailable until an authorized submission deadline is configured';
  end if;
  if v_now >= v_record.due_at then
    raise exception 'The submission deadline has passed';
  end if;
  if exists (
    select 1
    from public.document_reviews review
    where review.document_submission_id = p_submission_id
  ) then
    raise exception 'A reviewer has already acted on this submission';
  end if;

  update public.document_submissions
  set withdrawn_at = v_now,
      withdrawn_by_user_id = auth.uid(),
      withdrawal_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_submission_id
    and withdrawn_at is null;
  if not found then
    raise exception 'This document submission changed while the withdrawal was being processed';
  end if;

  insert into public.document_submission_withdrawals (
    document_submission_id, document_requirement_id,
    internship_assignment_id, withdrawn_by_user_id,
    previous_requirement_status, reason, withdrawn_at
  ) values (
    p_submission_id, v_record.document_requirement_id,
    v_record.internship_assignment_id, auth.uid(),
    v_record.requirement_status,
    nullif(trim(coalesce(p_reason, '')), ''), v_now
  );

  update public.document_requirements
  set current_submission_id = null,
      status = 'missing',
      updated_at = v_now
  where id = v_record.document_requirement_id
    and current_submission_id = p_submission_id;
  if not found then
    raise exception 'This document requirement changed while the withdrawal was being processed';
  end if;

  return jsonb_build_object(
    'submission_id', p_submission_id,
    'requirement_id', v_record.document_requirement_id,
    'status', 'withdrawn',
    'withdrawn_at', v_now
  );
end;
$function$;

revoke all on function public.withdraw_document_submission_v27(uuid,text) from public, anon;
grant execute on function public.withdraw_document_submission_v27(uuid,text) to authenticated;

comment on function public.withdraw_document_submission_v27(uuid,text) is
  'Atomically withdraws the signed-in Student owner current, unreviewed, pre-deadline submission while preserving the immutable file and submission history.';

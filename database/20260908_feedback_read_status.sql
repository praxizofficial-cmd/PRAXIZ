-- Recipient-facing feedback read state. Follow-up lifecycle status remains separate.
begin;

alter table public.internship_feedback
  add column if not exists recipient_read_at timestamptz;

create or replace function public.mark_internship_feedback_read(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sign in to read internship feedback';
  end if;

  update public.internship_feedback feedback
  set recipient_read_at = coalesce(feedback.recipient_read_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  from public.internship_assignments assignment
  where feedback.id = p_feedback_id
    and feedback.internship_assignment_id = assignment.id
    and feedback.deleted_at is null
    and assignment.deleted_at is null
    and assignment.student_user_id = auth.uid();

  if not found then
    raise exception 'This feedback is not available to your Student Intern account';
  end if;
end;
$function$;

revoke all on function public.mark_internship_feedback_read(uuid) from public, anon;
grant execute on function public.mark_internship_feedback_read(uuid) to authenticated;

commit;

-- Additive lifecycle hardening for evaluation deletion. Existing evaluation
-- rows, versions, scores, reviews, and finalized report snapshots are retained.
begin;

create or replace function public.delete_evaluation_draft(p_evaluation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  evaluation_record public.evaluations;
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete an evaluation draft';
  end if;

  -- Lock the row before checking status so a concurrent finalization or review
  -- cannot race a draft deletion.
  select *
  into evaluation_record
  from public.evaluations
  where id = p_evaluation_id
    and deleted_at is null
  for update;

  if not found
    or evaluation_record.evaluator_user_id <> auth.uid()
    or not private.can_score_evaluation_assignment(
      evaluation_record.internship_assignment_id,
      evaluation_record.evaluation_template_id
    ) then
    raise exception 'You cannot delete this evaluation';
  end if;

  if evaluation_record.status = 'finalized' then
    raise exception 'This evaluation can no longer be deleted because it has already been finalized.';
  end if;

  if evaluation_record.status <> 'draft' then
    raise exception 'Only Draft evaluations can be deleted.';
  end if;

  update public.evaluations
  set deleted_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = evaluation_record.id
    and status = 'draft'
    and deleted_at is null;

  if not found then
    raise exception 'This evaluation is no longer an active Draft and cannot be deleted.';
  end if;
end;
$function$;

revoke all on function public.delete_evaluation_draft(uuid) from public, anon;
grant execute on function public.delete_evaluation_draft(uuid) to authenticated;

commit;

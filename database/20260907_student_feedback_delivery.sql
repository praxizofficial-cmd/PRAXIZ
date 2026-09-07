-- Additive student feedback delivery. Existing feedback and notification rows
-- remain intact; author_role is a historical snapshot of the creating role.
begin;

alter table public.internship_feedback
  add column if not exists author_role text;

update public.internship_feedback feedback
set author_role = case
  when exists (
    select 1
    from public.role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.user_id = feedback.author_user_id
      and assignment.deleted_at is null
      and role.code = 'internship_coordinator'
  ) then 'Internship Coordinator'
  else 'HTE Supervisor'
end
where author_role is null;

alter table public.internship_feedback
  alter column author_role set not null;

alter table public.internship_feedback
  drop constraint if exists internship_feedback_author_role_check;
alter table public.internship_feedback
  add constraint internship_feedback_author_role_check
  check (author_role in ('Internship Coordinator', 'HTE Supervisor'));

alter table public.notifications
  drop constraint if exists notifications_related_entity_type_check;
alter table public.notifications
  add constraint notifications_related_entity_type_check
  check (related_entity_type in (
    'registration_application', 'internship_assignment', 'attendance_session',
    'daily_log', 'document_requirement', 'evaluation', 'internship_feedback'
  ));

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
  feedback_id uuid;
  created_notification_id uuid;
  student_user_id uuid;
  author_role text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create internship feedback';
  end if;
  if nullif(trim(p_subject), '') is null or length(trim(p_subject)) not between 3 and 160 then
    raise exception 'Enter a feedback subject between 3 and 160 characters';
  end if;
  if nullif(trim(p_message), '') is null or length(trim(p_message)) not between 3 and 5000 then
    raise exception 'Enter feedback between 3 and 5000 characters';
  end if;

  select assignment.student_user_id,
    case when private.can_manage_assignment(assignment.id)
      then 'Internship Coordinator' else 'HTE Supervisor' end
  into student_user_id, author_role
  from public.internship_assignments assignment
  where assignment.id = p_assignment_id
    and assignment.deleted_at is null
    and (
      private.can_manage_assignment(assignment.id)
      or exists (
        select 1
        from public.internship_supervisors supervisor
        where supervisor.internship_assignment_id = assignment.id
          and supervisor.supervisor_user_id = auth.uid()
          and supervisor.deleted_at is null
          and supervisor.started_at <= timezone('utc', now())
          and (supervisor.ended_at is null or supervisor.ended_at > timezone('utc', now()))
      )
    );

  if not found then
    raise exception 'You are not authorized to give feedback for this internship';
  end if;

  insert into public.internship_feedback (
    internship_assignment_id, author_user_id, author_role, subject, message
  ) values (
    p_assignment_id, auth.uid(), author_role, trim(p_subject), trim(p_message)
  ) returning id into feedback_id;

  -- Notification delivery is intentionally best-effort. A delivery problem
  -- never discards successfully saved feedback.
  begin
    insert into public.notifications (
      deduplication_key, type, title, message, severity, actor_user_id,
      internship_assignment_id, related_entity_type, related_entity_id, metadata
    ) values (
      'internship-feedback:' || feedback_id::text,
      'internship.feedback.created',
      'New feedback received',
      author_role || ' added feedback regarding "' || trim(p_subject) || '".',
      'info', auth.uid(), p_assignment_id, 'internship_feedback', feedback_id,
      jsonb_build_object('targetPath', '/student/feedback?feedback=' || feedback_id::text)
    ) returning id into created_notification_id;

    insert into public.notification_recipients (notification_id, user_id)
    values (created_notification_id, student_user_id)
    on conflict (notification_id, user_id) do nothing;
  exception when others then
    raise warning 'Feedback % was saved but its student notification could not be delivered', feedback_id;
  end;

  return feedback_id;
end;
$function$;

-- Make previously saved feedback discoverable through the same notification
-- path without duplicating feedback or notification records.
insert into public.notifications (
  deduplication_key, type, title, message, severity, actor_user_id,
  internship_assignment_id, related_entity_type, related_entity_id, metadata
)
select
  'internship-feedback:' || feedback.id::text,
  'internship.feedback.created',
  'New feedback received',
  feedback.author_role || ' added feedback regarding "' || feedback.subject || '".',
  'info', feedback.author_user_id, feedback.internship_assignment_id,
  'internship_feedback', feedback.id,
  jsonb_build_object('targetPath', '/student/feedback?feedback=' || feedback.id::text)
from public.internship_feedback feedback
where feedback.deleted_at is null
on conflict (deduplication_key) do nothing;

insert into public.notification_recipients (notification_id, user_id)
select notification.id, assignment.student_user_id
from public.internship_feedback feedback
join public.internship_assignments assignment
  on assignment.id = feedback.internship_assignment_id
join public.notifications notification
  on notification.deduplication_key = 'internship-feedback:' || feedback.id::text
where feedback.deleted_at is null
  and assignment.deleted_at is null
on conflict (notification_id, user_id) do nothing;

revoke all on function public.create_internship_feedback(uuid, text, text) from public, anon;
grant execute on function public.create_internship_feedback(uuid, text, text) to authenticated;

commit;

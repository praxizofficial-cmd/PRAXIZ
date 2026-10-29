-- Notify active System Administrators when a Student Intern applies.
-- Additive: no policy changes and no changes to existing applications.
begin;
create or replace function private.notify_student_registration_submitted()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare recipients uuid[];
begin
  if new.deleted_at is not null or new.status <> 'pending'
     or not exists (select 1 from public.roles where id = new.requested_role_id and code = 'student_intern') then
    return new;
  end if;
  select array_agg(distinct assignment.user_id) into recipients
  from public.role_assignments assignment
  join public.roles role on role.id = assignment.role_id
  join public.profiles profile on profile.id = assignment.user_id
  where role.code = 'system_admin'
    and assignment.deleted_at is null
    and assignment.starts_at <= now()
    and (assignment.ends_at is null or assignment.ends_at > now())
    and profile.deleted_at is null and profile.account_status = 'active';
  perform private.emit_notification(
    'registration:' || new.id::text || ':submitted',
    'registration.submitted', 'New student registration',
    'A Student Intern submitted an account registration. Review the application in Registrations.',
    'info', new.requester_user_id, null, 'registration_application', new.id,
    recipients, jsonb_build_object('targetPath', '/admin/registrations', 'status', new.status)
  );
  return new;
end;
$function$;
revoke all on function private.notify_student_registration_submitted() from public, anon, authenticated;
create or replace trigger notify_student_registration_submitted_after_insert
after insert on public.registration_applications
for each row execute function private.notify_student_registration_submitted();
commit;

-- Registration eligibility and notification lifecycle. No registration decisions or RLS changes.
begin;
create or replace function private.admin_notification_recipients()
returns uuid[] language sql stable security definer set search_path = '' as $$
 select array_agg(distinct a.user_id) from public.role_assignments a
 join public.roles r on r.id=a.role_id join public.profiles p on p.id=a.user_id
 where r.code='system_admin' and r.is_active and a.deleted_at is null
 and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
 and p.deleted_at is null and p.account_status='active';
$$;
revoke all on function private.admin_notification_recipients() from public,anon,authenticated;

create or replace function private.sync_registration_notification(application_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.registration_applications%rowtype; student_name text; campus_name text; eligible boolean;
begin
 select * into a from public.registration_applications where id=application_id;
 if not found then return; end if;
 eligible := a.deleted_at is null and a.status in ('pending','under_review')
 and exists(select 1 from public.roles where id=a.requested_role_id and code='student_intern')
 and exists(select 1 from auth.users where id=a.requester_user_id and email_confirmed_at is not null);
 if eligible then
  select coalesce(nullif(preferred_name,''),nullif(trim(concat_ws(' ',first_name,middle_name,last_name,suffix)),''),'Student Intern')
  into student_name from public.profiles where id=a.requester_user_id;
  select name into campus_name from public.org_units where id=a.campus_org_unit_id;
  perform private.emit_notification('registration:'||a.id::text||':submitted','registration.submitted',
   'New Student Registration',format('A new Student Intern registration from %s at %s requires institutional review.',coalesce(student_name,'Student Intern'),coalesce(campus_name,'their registered campus')),
   'warning',a.requester_user_id,null,'registration_application',a.id,private.admin_notification_recipients(),
   jsonb_build_object('category','Registration & Accounts','priority','high','actionRequired',true,
    'actionLabel','Review Registration','sourceModule','Registrations','campus',campus_name,
    'targetPath','/admin/registrations?registration='||a.id::text));
 end if;
 -- Preserve read/archive state and history; eligibility is independent of whether it was read.
 update public.notifications set metadata=metadata||jsonb_build_object('actionRequired',eligible,
  'actionStatus',case when eligible then 'needs_action' else a.status end)
 where related_entity_type='registration_application' and related_entity_id=a.id and type='registration.submitted';
end;
$$;
revoke all on function private.sync_registration_notification(uuid) from public,anon,authenticated;
create or replace function private.notify_student_registration_submitted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.sync_registration_notification(new.id); return new; end;
$$;
create or replace trigger notify_student_registration_submitted_after_insert
 after insert on public.registration_applications for each row execute function private.notify_student_registration_submitted();
create or replace trigger notify_student_registration_state_changed
 after update of status,deleted_at on public.registration_applications for each row execute function private.notify_student_registration_submitted();
create or replace function private.notify_verified_student_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare application_id uuid;
begin
 for application_id in select id from public.registration_applications where requester_user_id=new.id
 loop perform private.sync_registration_notification(application_id); end loop;
 return new;
end;
$$;
revoke all on function private.notify_verified_student_registration() from public,anon,authenticated;
create or replace trigger notify_verified_student_registration
 after update of email_confirmed_at on auth.users for each row
 when(old.email_confirmed_at is distinct from new.email_confirmed_at)
 execute function private.notify_verified_student_registration();
-- One-time idempotent repair: only currently actionable, verified applications.
do $$ declare application_id uuid; begin
 for application_id in select a.id from public.registration_applications a
 join auth.users u on u.id=a.requester_user_id
 where a.deleted_at is null and a.status in ('pending','under_review') and u.email_confirmed_at is not null
 loop perform private.sync_registration_notification(application_id); end loop;
end $$;
-- Realtime recipient events remain protected by the existing recipient RLS policies.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notification_recipients') then
  alter publication supabase_realtime add table public.notification_recipients;
 end if;
end $$;
commit;

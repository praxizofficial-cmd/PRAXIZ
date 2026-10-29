-- Notification event content is append-only. Workflow triggers must provide
-- complete metadata to emit_notification and must never mutate the event row
-- after it has been inserted.

begin;

create or replace function private.notify_admin_workflow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare item jsonb := to_jsonb(new); entity text; state text; actionable boolean;
 title text; message text; category text; priority text := 'high'; target text; notification_type text;
begin
 case tg_table_name
 when 'hte_organizations' then
  entity := 'hte_organization'; state := item->>'verification_status'; actionable := state='pending' and item->>'deleted_at' is null;
  title := 'HTE Verification Required'; message := 'An HTE organization requires administrator verification.';
  category := 'HTE Verification & Organizations'; target := '/admin/hte-verification';
 when 'required_file_format_versions' then
  entity := 'required_file_format_version'; state := item->>'status'; actionable := state='submitted';
  title := 'Required File Ready for Review'; message := 'A file-format version was submitted for administrator review and publication.';
  category := 'Files & Workflow Templates'; target := '/admin/file-formats';
 when 'outbox_events' then
  entity := 'outbox_event'; state := item->>'status'; actionable := state='dead_letter';
  title := 'Background Job Requires Investigation'; message := 'A background job exhausted its configured retries. Review the operational logs.';
  category := 'System Operations & Data Integrity'; priority := 'critical'; target := '/admin/audit-logs';
 else return new;
 end case;
 notification_type := 'admin.'||entity;
 if actionable then
  perform private.emit_notification(notification_type||':'||(item->>'id'),notification_type,title,message,
   case when priority='critical' then 'error' else 'warning' end,null,null,entity,(item->>'id')::uuid,
   private.admin_notification_recipients(),jsonb_build_object('category',category,'priority',priority,
    'actionRequired',true,'actionStatus','needs_action','targetPath',target,'sourceModule',category,'actionLabel','Review record'));
 end if;
 return new;
end;
$$;
revoke all on function private.notify_admin_workflow() from public,anon,authenticated;

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
    'actionStatus','needs_action','actionLabel','Review Registration','sourceModule','Registrations','campus',campus_name,
    'targetPath','/admin/registrations?registration='||a.id::text));
 end if;
end;
$$;
revoke all on function private.sync_registration_notification(uuid) from public,anon,authenticated;

commit;

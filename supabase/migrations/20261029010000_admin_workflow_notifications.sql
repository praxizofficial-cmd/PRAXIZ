-- Actual backend state transitions only; no synthetic security events or routine student alerts.
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
 update public.notifications set metadata=metadata||jsonb_build_object('actionRequired',actionable,
  'actionStatus',case when actionable then 'needs_action' else state end)
 where type=notification_type and related_entity_id=(item->>'id')::uuid;
 return new;
end;
$$;
revoke all on function private.notify_admin_workflow() from public,anon,authenticated;
create or replace trigger notify_admin_hte_verification after insert or update of verification_status,deleted_at
 on public.hte_organizations for each row execute function private.notify_admin_workflow();
create or replace trigger notify_admin_file_submission after insert or update of status
 on public.required_file_format_versions for each row execute function private.notify_admin_workflow();
create or replace trigger notify_admin_exhausted_job after insert or update of status
 on public.outbox_events for each row execute function private.notify_admin_workflow();
commit;

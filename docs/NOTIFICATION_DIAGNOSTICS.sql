-- Read-only catalog diagnostics. Not a migration; no application records are read or changed.
-- Run only through an authorized database session when investigating live delivery.
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('notifications', 'notification_recipients');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
and tablename in ('notifications', 'notification_recipients');

select table_name, column_name, data_type, is_nullable
from information_schema.columns where table_schema = 'public'
and table_name in ('notifications', 'notification_recipients')
order by table_name, ordinal_position;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proconfig,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
and (p.proname in ('mark_notification_read', 'mark_all_notifications_read')
     or p.proname like '%notif%');

select c.relname as source_table, t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname = 'public'
and c.relname in ('registration_applications', 'hte_organizations', 'contact_messages',
                 'notifications', 'notification_recipients', 'document_submissions');

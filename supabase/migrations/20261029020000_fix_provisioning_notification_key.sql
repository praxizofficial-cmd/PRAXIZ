-- Preserve the current completion function and its authorization checks. Older
-- versions predate the required notification deduplication key.
begin;
do $migration$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef('public.complete_authorized_account_provisioning(uuid,uuid)'::regprocedure)
  into definition;
  if position('''provisioning:account-ready:'' || application.id::text' in definition) = 0 then
    corrected := replace(definition,
      'type, title, message, severity, actor_user_id,',
      'deduplication_key, type, title, message, severity, actor_user_id,');
    corrected := replace(corrected,
      '''registration_approved'', ''PRAXIZ account ready'',',
      '''provisioning:account-ready:'' || application.id::text, ''registration_approved'', ''PRAXIZ account ready'',');
    if corrected = definition or position('''provisioning:account-ready:'' || application.id::text' in corrected) = 0
      or position('deduplication_key, type, title' in corrected) = 0 then
      raise exception 'Unexpected provisioning function definition; no changes applied';
    end if;
    execute corrected;
  end if;
end;
$migration$;
commit;

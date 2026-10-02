-- Supabase's newer server secret keys authorize PostgREST as service_role but do
-- not populate the retired request.jwt.claim.role setting. The function already
-- has an explicit service_role-only EXECUTE ACL, so remove the obsolete runtime
-- claim check while preserving that database permission boundary.
begin;

do $migration$
declare
  definition text;
  corrected text;
  obsolete_guard text := E'\n  if coalesce(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role'' then\n    raise exception ''Privileged account completion is server-only'';\n  end if;\n';
begin
  select pg_get_functiondef(
    'public.complete_authorized_account_provisioning(uuid,uuid)'::regprocedure
  ) into definition;

  if position('Privileged account completion is server-only' in definition) > 0 then
    corrected := replace(definition, obsolete_guard, E'\n');
    if corrected = definition then
      raise exception 'The obsolete service-role claim guard could not be removed safely';
    end if;
    execute corrected;
  end if;
end;
$migration$;

revoke all on function public.complete_authorized_account_provisioning(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_authorized_account_provisioning(uuid, uuid) to service_role;

commit;

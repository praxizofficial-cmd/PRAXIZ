-- Production no longer has the retired faculty_profiles relation. Remove the
-- historical compatibility write from the privileged Coordinator invitation
-- function while preserving the role assignment and organization membership.
begin;

do $migration$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef(
    'public.complete_authorized_account_provisioning(uuid,uuid)'::regprocedure
  ) into definition;

  if position('insert into public.faculty_profiles' in definition) > 0 then
    corrected := regexp_replace(
      definition,
      E'\\s+insert into public\\.faculty_profiles \\(user_id, employee_no, academic_rank\\).*?updated_at = timezone\\(''utc'', now\\(\\)\\);',
      '',
      's'
    );
    if corrected = definition then
      raise exception 'The obsolete faculty profile write could not be removed safely';
    end if;
    execute corrected;
  end if;
end;
$migration$;

commit;

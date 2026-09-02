begin;

-- Keep the historical role row for audit compatibility, but prevent new use.
update public.roles
set is_active = false,
    updated_at = timezone('utc', now())
where code = 'faculty_supervisor';

-- Preserve the governed assignment lifecycle while removing only the obsolete
-- faculty-supervisor activation requirement. Coordinator and HTE checks remain.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(p.oid)
  into function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'validate_internship_assignment';

  if position('array[''faculty'', ''coordinator'', ''hte'']' in function_definition) > 0 then
    function_definition := replace(
      function_definition,
      'array[''faculty'', ''coordinator'', ''hte'']',
      'array[''coordinator'', ''hte'']'
    );
    execute function_definition;
  elsif position('array[''coordinator'', ''hte'']' in function_definition) = 0 then
    raise exception 'The assignment validation function has an unexpected supervisor rule';
  end if;
end $$;

commit;

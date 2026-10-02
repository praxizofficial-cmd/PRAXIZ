-- Allow the server-only account provisioning route to perform its direct
-- PostgREST reads and writes. The completion workflow remains restricted to
-- the SECURITY DEFINER function granted to service_role.
begin;

grant select on table public.roles to service_role;
grant select on table public.academic_programs to service_role;
grant select on table public.org_units to service_role;
grant select on table public.hte_organizations to service_role;

grant select, insert, delete
  on table public.account_provisioning_authorizations
  to service_role;

grant select, insert
  on table public.registration_applications
  to service_role;

commit;

-- Student Interns remain the only public self-registration role. Privileged
-- invitations require a short-lived authorization created by the server route.
begin;

create table if not exists public.account_provisioning_authorizations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  requested_role_id uuid not null references public.roles(id),
  authorized_by_user_id uuid not null references auth.users(id),
  scope_hte_id uuid references public.hte_organizations(id),
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists account_provisioning_pending_email_role_idx
  on public.account_provisioning_authorizations (lower(email), requested_role_id)
  where consumed_at is null;

alter table public.account_provisioning_authorizations enable row level security;
revoke all on table public.account_provisioning_authorizations from public, anon, authenticated;

create or replace function private.enforce_public_student_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_code text;
  v_authorization public.account_provisioning_authorizations%rowtype;
begin
  select role.code into requested_code from public.roles role where role.id = new.requested_role_id;
  if requested_code = 'student_intern' then return new; end if;
  if requested_code not in ('internship_coordinator', 'hte_supervisor') then
    raise exception 'This role cannot be requested through public account creation';
  end if;

  select * into v_authorization
  from public.account_provisioning_authorizations item
  where lower(item.email) = lower(new.email)
    and item.requested_role_id = new.requested_role_id
    and item.consumed_at is null
    and item.expires_at > timezone('utc', now())
  order by item.created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'Coordinator and HTE Representative accounts require an authorized PRAXIZ invitation';
  end if;

  new.submitted_data = coalesce(new.submitted_data, '{}'::jsonb)
    || v_authorization.metadata
    || jsonb_build_object('provisioned_by_user_id', v_authorization.authorized_by_user_id::text);
  update public.account_provisioning_authorizations
  set consumed_at = timezone('utc', now())
  where id = v_authorization.id;
  return new;
end;
$function$;

drop trigger if exists enforce_public_student_registration on public.registration_applications;
create trigger enforce_public_student_registration
before insert on public.registration_applications
for each row execute function private.enforce_public_student_registration();

commit;

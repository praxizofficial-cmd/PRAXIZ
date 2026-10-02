-- Persistent, server-delivered public contact messages with administrator-only access.
begin;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null check (length(trim(sender_name)) between 2 and 120),
  sender_email text not null check (length(trim(sender_email)) between 3 and 160),
  subject text not null check (length(trim(subject)) between 2 and 160),
  message text not null check (length(trim(message)) between 10 and 5000),
  status text not null default 'new' check (status in ('new', 'read', 'resolved')),
  received_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists contact_messages_received_idx
  on public.contact_messages(received_at desc);
create index if not exists contact_messages_status_idx
  on public.contact_messages(status, received_at desc);

create or replace function private.is_system_administrator(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    join public.profiles profile on profile.id = assignment.user_id
    where assignment.user_id = p_user_id
      and role.code = 'system_admin'
      and role.is_active
      and assignment.deleted_at is null
      and (assignment.starts_at is null or assignment.starts_at <= now())
      and (assignment.ends_at is null or assignment.ends_at > now())
      and profile.account_status = 'active'
      and profile.deleted_at is null
  );
$function$;

revoke all on function private.is_system_administrator(uuid) from public, anon;
grant execute on function private.is_system_administrator(uuid) to authenticated, service_role;

alter table public.contact_messages enable row level security;
drop policy if exists contact_messages_admin_read on public.contact_messages;
create policy contact_messages_admin_read
on public.contact_messages for select to authenticated
using (private.is_system_administrator(auth.uid()));

drop policy if exists contact_messages_admin_update on public.contact_messages;
create policy contact_messages_admin_update
on public.contact_messages for update to authenticated
using (private.is_system_administrator(auth.uid()))
with check (private.is_system_administrator(auth.uid()));

revoke all on public.contact_messages from public, anon, authenticated;
grant select on public.contact_messages to authenticated;
grant update (status) on public.contact_messages to authenticated;
grant insert, select, update on public.contact_messages to service_role;

commit;

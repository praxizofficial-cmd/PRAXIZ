-- V27 support inbox: independent read/case state and immutable reply attempts.
-- Existing messages and legacy status values are preserved.
begin;

alter table public.contact_messages
  add column if not exists read_at timestamptz,
  add column if not exists read_by uuid references auth.users(id),
  add column if not exists case_status text not null default 'open',
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id);

update public.contact_messages
set read_at = coalesce(read_at, received_at)
where status in ('read', 'resolved') and read_at is null;

update public.contact_messages
set case_status = 'resolved',
    resolved_at = coalesce(resolved_at, updated_at)
where status = 'resolved';

alter table public.contact_messages
  drop constraint if exists contact_messages_case_status_check;
alter table public.contact_messages
  add constraint contact_messages_case_status_check
  check (case_status in ('open', 'resolved'));

create table if not exists public.support_message_replies (
  id uuid primary key default gen_random_uuid(),
  contact_message_id uuid not null references public.contact_messages(id) on delete restrict,
  responder_user_id uuid not null references auth.users(id),
  recipient_email text not null check (length(trim(recipient_email)) between 3 and 160),
  subject text not null check (length(trim(subject)) between 2 and 200),
  body text not null check (length(trim(body)) between 2 and 5000),
  delivery_status text not null default 'attempting'
    check (delivery_status in ('attempting', 'accepted', 'failed')),
  provider text not null default 'resend' check (provider = 'resend'),
  provider_message_id text,
  failure_reason text,
  attempted_at timestamptz not null default timezone('utc', now()),
  provider_accepted_at timestamptz,
  constraint support_reply_acceptance_consistent check (
    (delivery_status = 'accepted' and provider_message_id is not null and provider_accepted_at is not null)
    or delivery_status <> 'accepted'
  )
);

create index if not exists support_message_replies_message_idx
  on public.support_message_replies(contact_message_id, attempted_at desc);
create index if not exists support_message_replies_responder_rate_idx
  on public.support_message_replies(responder_user_id, attempted_at desc);

create table if not exists public.support_message_case_events (
  id uuid primary key default gen_random_uuid(),
  contact_message_id uuid not null references public.contact_messages(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('marked_read', 'resolved', 'reopened')),
  occurred_at timestamptz not null default timezone('utc', now())
);

create index if not exists support_message_case_events_message_idx
  on public.support_message_case_events(contact_message_id, occurred_at desc);

alter table public.support_message_replies enable row level security;
alter table public.support_message_case_events enable row level security;
drop policy if exists support_message_replies_admin_read on public.support_message_replies;
create policy support_message_replies_admin_read
on public.support_message_replies for select to authenticated
using (private.is_system_administrator(auth.uid()));

drop policy if exists support_message_case_events_admin_read on public.support_message_case_events;
create policy support_message_case_events_admin_read
on public.support_message_case_events for select to authenticated
using (private.is_system_administrator(auth.uid()));

revoke all on public.support_message_replies from public, anon, authenticated;
grant select on public.support_message_replies to authenticated;
grant insert, update, select on public.support_message_replies to service_role;
revoke all on public.support_message_case_events from public, anon, authenticated;
grant select on public.support_message_case_events to authenticated;
grant insert, select on public.support_message_case_events to service_role;

create or replace function public.mark_support_message_read_v27(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_read_at timestamptz;
begin
  if not private.is_system_administrator(auth.uid()) then
    raise exception 'Only an active System Administrator may update support messages.' using errcode = '42501';
  end if;

  select read_at into v_read_at
  from public.contact_messages
  where id = p_message_id
  for update;
  if not found then raise exception 'Support message not found.' using errcode = 'P0002'; end if;
  if v_read_at is not null then return; end if;

  update public.contact_messages
  set read_at = coalesce(read_at, timezone('utc', now())),
      read_by = coalesce(read_by, auth.uid()),
      status = case when case_status = 'resolved' then 'resolved' else 'read' end,
      updated_at = timezone('utc', now())
  where id = p_message_id;

  insert into public.support_message_case_events(contact_message_id, actor_user_id, event_type)
  values (p_message_id, auth.uid(), 'marked_read');
end;
$function$;

create or replace function public.set_support_case_status_v27(
  p_message_id uuid,
  p_case_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_previous_status text;
begin
  if not private.is_system_administrator(auth.uid()) then
    raise exception 'Only an active System Administrator may update support cases.' using errcode = '42501';
  end if;
  if p_case_status not in ('open', 'resolved') then
    raise exception 'Choose open or resolved.' using errcode = '22023';
  end if;

  select case_status into v_previous_status
  from public.contact_messages
  where id = p_message_id
  for update;
  if not found then raise exception 'Support message not found.' using errcode = 'P0002'; end if;
  if v_previous_status = p_case_status then return; end if;

  update public.contact_messages
  set case_status = p_case_status,
      resolved_at = case when p_case_status = 'resolved' then timezone('utc', now()) else null end,
      resolved_by = case when p_case_status = 'resolved' then auth.uid() else null end,
      status = case
        when p_case_status = 'resolved' then 'resolved'
        when read_at is not null then 'read'
        else 'new'
      end,
      updated_at = timezone('utc', now())
  where id = p_message_id;

  insert into public.support_message_case_events(contact_message_id, actor_user_id, event_type)
  values (
    p_message_id,
    auth.uid(),
    case when p_case_status = 'resolved' then 'resolved' else 'reopened' end
  );
end;
$function$;

revoke all on function public.mark_support_message_read_v27(uuid) from public, anon;
revoke all on function public.set_support_case_status_v27(uuid, text) from public, anon;
grant execute on function public.mark_support_message_read_v27(uuid) to authenticated;
grant execute on function public.set_support_case_status_v27(uuid, text) to authenticated;

-- Remove the legacy direct status mutation now that audited actor/timestamps are explicit.
revoke update on public.contact_messages from authenticated;

commit;

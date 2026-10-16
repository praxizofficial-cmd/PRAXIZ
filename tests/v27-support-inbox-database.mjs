import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create function private.is_system_administrator(p_user_id uuid)
returns boolean language sql stable security definer as $$
  select p_user_id::text = current_setting('test.admin_uid', true)
$$;
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null,
  sender_email text not null,
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new','read','resolved')),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant usage on schema public, private, auth to authenticated, service_role;
grant execute on function private.is_system_administrator(uuid) to authenticated, service_role;
`);

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261016020000_v27_support_inbox_workflow.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1);
const outsider = id(2);
const message = id(3);
await db.exec(`
insert into auth.users(id) values('${admin}'),('${outsider}');
insert into contact_messages(id,sender_name,sender_email,subject,message)
values('${message}','Sender','sender@example.com','Help','Please help with a general question.');
select set_config('test.admin_uid','${admin}',false);
`);

async function asUser(user) {
  await db.exec(`
    reset role;
    select set_config('test.uid','${user}',false);
    set role authenticated;
  `);
}

await asUser(outsider);
await assert.rejects(
  db.query(`select mark_support_message_read_v27('${message}')`),
  /Only an active System Administrator/,
);

await asUser(admin);
await db.query(`select mark_support_message_read_v27('${message}')`);
await db.query(`select mark_support_message_read_v27('${message}')`);
await db.exec("reset role");
let record = (await db.query(`select status,read_at,case_status from contact_messages where id='${message}'`)).rows[0];
assert.equal(record.status, "read");
assert.ok(record.read_at);
assert.equal(record.case_status, "open");
assert.equal(
  (await db.query(`select count(*)::int as n from support_message_case_events where contact_message_id='${message}' and event_type='marked_read'`)).rows[0].n,
  1,
);

await asUser(admin);
await db.query(`select set_support_case_status_v27('${message}','resolved')`);
await db.query(`select set_support_case_status_v27('${message}','resolved')`);
await db.query(`select set_support_case_status_v27('${message}','open')`);
await db.exec("reset role");
record = (await db.query(`select status,read_at,case_status,resolved_at from contact_messages where id='${message}'`)).rows[0];
assert.equal(record.status, "read", "reopening must not erase read state");
assert.ok(record.read_at);
assert.equal(record.case_status, "open");
assert.equal(record.resolved_at, null);
assert.deepEqual(
  (await db.query(`select event_type from support_message_case_events where contact_message_id='${message}' order by occurred_at,id`)).rows.map((row) => row.event_type),
  ["marked_read", "resolved", "reopened"],
);

await db.exec(`
set role service_role;
insert into support_message_replies(
  contact_message_id,responder_user_id,recipient_email,subject,body,delivery_status
) values('${message}','${admin}','sender@example.com','Re: Help','General guidance','attempting');
`);
await assert.rejects(
  db.query(`insert into support_message_replies(
    contact_message_id,responder_user_id,recipient_email,subject,body,delivery_status
  ) values('${message}','${admin}','sender@example.com','Re: Help','False success','accepted')`),
  /support_reply_acceptance_consistent/,
);

console.log(
  "PASS: v27 support read/case separation, immutable events, admin authorization, replay, and truthful delivery-status contracts.",
);
await db.close();

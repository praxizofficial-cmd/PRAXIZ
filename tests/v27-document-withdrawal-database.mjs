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
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create table public.profiles(id uuid primary key, active boolean default true);
create table public.internship_assignments(
  id uuid primary key, student_user_id uuid not null, deleted_at timestamptz
);
create table public.document_requirements(
  id uuid primary key,
  internship_assignment_id uuid not null references public.internship_assignments(id),
  current_submission_id uuid,
  status text not null,
  due_at timestamptz,
  updated_at timestamptz default now()
);
create table public.document_submissions(
  id uuid primary key,
  document_requirement_id uuid not null references public.document_requirements(id),
  submitted_by_user_id uuid not null references public.profiles(id),
  submitted_at timestamptz default now()
);
alter table public.document_requirements
  add constraint document_requirements_current_submission_fk
  foreign key(current_submission_id) references public.document_submissions(id);
create table public.document_reviews(
  id uuid primary key default gen_random_uuid(),
  document_submission_id uuid not null references public.document_submissions(id)
);
create function private.is_active_user(uuid) returns boolean language sql security definer as $$
  select coalesce((select active from public.profiles where id=$1), false)
$$;
create function private.can_view_assignment(uuid) returns boolean language sql security definer as $$
  select exists(
    select 1 from public.internship_assignments
    where id=$1 and student_user_id=auth.uid() and deleted_at is null
  )
$$;
grant usage on schema public, private, auth to authenticated, service_role;
grant select on all tables in schema public to authenticated;
`);

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261016010000_v27_document_submission_withdrawal.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);

const id = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const student = id(1);
const otherStudent = id(2);
const assignment = id(3);
await db.exec(`
insert into profiles(id) values('${student}'),('${otherStudent}');
insert into internship_assignments(id,student_user_id) values('${assignment}','${student}');
`);

async function asUser(user) {
  await db.exec(`
    reset role;
    select set_config('test.uid','${user}',false);
    set role authenticated;
  `);
}

async function addSubmission(n, dueExpression, status = "submitted") {
  const requirement = id(n);
  const submission = id(n + 1);
  await db.exec(`reset role;
    insert into document_requirements(id,internship_assignment_id,status,due_at)
    values('${requirement}','${assignment}','${status}',${dueExpression});
    insert into document_submissions(id,document_requirement_id,submitted_by_user_id)
    values('${submission}','${requirement}','${student}');
    update document_requirements set current_submission_id='${submission}' where id='${requirement}';
  `);
  return { requirement, submission };
}

const noDeadline = await addSubmission(10, "null");
await asUser(student);
await assert.rejects(
  db.query(`select withdraw_document_submission_v27('${noDeadline.submission}',null)`),
  /authorized submission deadline/,
);

const future = await addSubmission(20, "now() + interval '2 days'", "under_review");
await asUser(otherStudent);
await assert.rejects(
  db.query(`select withdraw_document_submission_v27('${future.submission}',null)`),
  /not available for your account/,
);
await asUser(student);
await db.query(
  `select withdraw_document_submission_v27('${future.submission}','Replacing an incorrect file')`,
);
await db.exec("reset role");
assert.deepEqual(
  (
    await db.query(
      `select status,current_submission_id from document_requirements where id='${future.requirement}'`,
    )
  ).rows[0],
  { status: "missing", current_submission_id: null },
);
assert.equal(
  (
    await db.query(
      `select count(*)::int as n from document_submission_withdrawals where document_submission_id='${future.submission}'`,
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      `select withdrawal_reason from document_submissions where id='${future.submission}'`,
    )
  ).rows[0].withdrawal_reason,
  "Replacing an incorrect file",
);

const reviewed = await addSubmission(30, "now() + interval '2 days'");
await db.exec(
  `insert into document_reviews(document_submission_id) values('${reviewed.submission}')`,
);
await asUser(student);
await assert.rejects(
  db.query(`select withdraw_document_submission_v27('${reviewed.submission}',null)`),
  /reviewer has already acted/,
);

const expired = await addSubmission(40, "now() - interval '1 minute'");
await asUser(student);
await assert.rejects(
  db.query(`select withdraw_document_submission_v27('${expired.submission}',null)`),
  /deadline has passed/,
);

await db.exec("reset role");
assert.equal(
  (await db.query("select count(*)::int as n from document_submissions")).rows[0].n,
  4,
  "withdrawal must preserve every immutable submission row",
);
console.log(
  "PASS: v27 transactional withdrawal ownership, deadline, review, history, and up-safe replay contracts.",
);
await db.close();

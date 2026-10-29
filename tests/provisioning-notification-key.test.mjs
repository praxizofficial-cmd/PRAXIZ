import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('coordinator completion supplies the required notification key and preserves server-only access', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      set timezone = 'UTC'; create role anon; create role authenticated; create role service_role;
      create table roles(id uuid primary key, code text, is_active boolean default true);
      create table profiles(id uuid primary key, account_status text, updated_at timestamptz);
      create table registration_applications(id uuid primary key, requester_user_id uuid, requested_role_id uuid, email text, status text, deleted_at timestamptz, organization_unit_id uuid, academic_program_id uuid, submitted_data jsonb, reviewed_by_user_id uuid, reviewed_at timestamptz, review_notes text, updated_at timestamptz);
      create table account_provisioning_authorizations(id uuid primary key, email text, requested_role_id uuid, authorized_by_user_id uuid, consumed_at timestamptz, expires_at timestamptz, created_at timestamptz default now(), scope_hte_id uuid);
      create table role_assignments(id uuid default gen_random_uuid(), user_id uuid, role_id uuid, scope_org_unit_id uuid, scope_hte_id uuid, scope_academic_program_id uuid, assigned_by_user_id uuid, deleted_at timestamptz, starts_at timestamptz default now(), ends_at timestamptz, created_at timestamptz default now());
      create table user_org_memberships(user_id uuid, org_unit_id uuid, membership_type text, is_primary boolean);
      create table notifications(id uuid default gen_random_uuid(), deduplication_key text not null unique, type text, title text, message text, severity text, actor_user_id uuid, related_entity_type text, related_entity_id uuid);
      create table notification_recipients(notification_id uuid, user_id uuid);
    `);
    await db.exec(read('../database/20260908_complete_privileged_provisioning.sql'));
    const ids = Array.from({length: 7}, (_, i) => `00000000-0000-0000-0000-00000000000${i + 1}`);
    const [admin, invited, adminRole, coordinatorRole, application, unit, program] = ids;
    await db.query("insert into roles(id,code) values ($1,'system_admin'),($2,'internship_coordinator')", [adminRole, coordinatorRole]);
    await db.query("insert into profiles(id,account_status) values ($1,'active'),($2,'pending')", [admin, invited]);
    await db.query('insert into role_assignments(user_id,role_id) values ($1,$2)', [admin, adminRole]);
    await db.query("insert into registration_applications(id,requester_user_id,requested_role_id,email,status,organization_unit_id,academic_program_id) values ($1,$2,$3,'test@example.invalid','pending',$4,$5)", [application, invited, coordinatorRole, unit, program]);
    await db.query("insert into account_provisioning_authorizations(id,email,requested_role_id,authorized_by_user_id,consumed_at,expires_at) values (gen_random_uuid(),'test@example.invalid',$1,$2,now(),now()+interval '1 hour')", [coordinatorRole, admin]);
    const complete = () => db.query('select complete_authorized_account_provisioning($1,$2)', [application, admin]);
    await assert.rejects(complete(), /deduplication_key/);
    assert.equal((await db.query('select status from registration_applications')).rows[0].status, 'pending');
    const migration = read('../supabase/migrations/20261029020000_fix_provisioning_notification_key.sql');
    await db.exec(migration);
    await db.exec(migration);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.complete_authorized_account_provisioning(uuid,uuid)','execute') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('service_role','public.complete_authorized_account_provisioning(uuid,uuid)','execute') as allowed")).rows[0].allowed, true);
    await assert.rejects(db.query('select complete_authorized_account_provisioning($1,$2)', [application, invited]), /authorization is invalid/);
    await complete();
    assert.equal((await db.query('select status from registration_applications')).rows[0].status, 'approved');
    assert.equal((await db.query('select deduplication_key from notifications')).rows[0].deduplication_key, `provisioning:account-ready:${application}`);
    assert.equal((await db.query('select user_id from notification_recipients')).rows[0].user_id, invited);
    await assert.rejects(complete(), /already been completed/);
    assert.equal((await db.query('select count(*)::int as count from notifications')).rows[0].count, 1);
  } finally { await db.close(); }
});

import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("HTE academic-program migration compiles against the current relationship shape", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create table auth.users (id uuid primary key);
    create table public.test_program_permissions (user_id uuid, program_id uuid, primary key (user_id, program_id));
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function private.is_active_user(uuid) returns boolean language sql stable as $$ select true $$;
    create function private.user_has_role_code(uuid,text) returns boolean language sql stable as $$ select $2 = 'internship_coordinator' $$;
    create function private.has_program_permission(text,uuid,uuid) returns boolean language sql stable as $$
      select exists (
        select 1 from public.test_program_permissions permission
        where permission.user_id = auth.uid() and permission.program_id = $3
      )
    $$;

    create table public.org_units (
      id uuid primary key, parent_id uuid, unit_type text, name text,
      short_name text, is_active boolean default true, deleted_at timestamptz
    );
    create table public.academic_programs (
      id uuid primary key, code text, name text, owning_org_unit_id uuid,
      is_active boolean default true, deleted_at timestamptz
    );
    create table public.hte_organizations (
      id uuid primary key default gen_random_uuid(), name text, trade_name text, registration_number text,
      industry text, address_line text, city_municipality text, province text,
      country_code text, contact_email text, contact_phone text,
      verification_status text, metadata jsonb default '{}'::jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      deleted_at timestamptz
    );
    create table public.profiles (
      id uuid primary key, preferred_name text, first_name text, middle_name text,
      last_name text, account_status text, deleted_at timestamptz
    );
    create table public.student_profiles (
      user_id uuid primary key, student_number text, academic_program_id uuid,
      deleted_at timestamptz
    );
    create table public.academic_years (
      id uuid primary key, label text, deleted_at timestamptz
    );
    create table public.academic_terms (
      id uuid primary key, academic_year_id uuid, term text,
      starts_on date, ends_on date, deleted_at timestamptz
    );
    create table public.internship_assignments (
      id uuid primary key, hte_id uuid, academic_program_id uuid,
      student_user_id uuid, status text, deleted_at timestamptz
    );
    create table public.internship_supervisors (
      internship_assignment_id uuid, supervisor_user_id uuid,
      supervisor_type text, started_at timestamptz, ended_at timestamptz,
      deleted_at timestamptz
    );
    create table public.hte_representatives (
      hte_id uuid, user_id uuid, is_primary boolean, starts_on date,
      ends_on date, created_at timestamptz, deleted_at timestamptz
    );
    create table public.hte_daily_hour_configs (
      hte_id uuid, daily_required_hours numeric, status text,
      effective_from date, effective_to date, updated_at timestamptz
    );
    create function public.create_partner_hte(text,text,text,text,text,text,text,text)
      returns uuid language sql as $$ select null::uuid $$;
  `);
  const migration = await readFile(
    new URL("supabase/migrations/20261029030000_hte_academic_program_scope.sql", root),
    "utf8",
  );
  await db.exec(migration);
  const associationTable = await db.query(`
    select count(*)::int as count
    from information_schema.tables
    where table_schema = 'public' and table_name = 'hte_academic_programs'
  `);
  assert.equal(associationTable.rows[0].count, 1);
  const functions = await db.query(`
    select count(*)::int as count from pg_proc
    where proname in (
      'list_authorized_hte_programs_v29',
      'create_partner_hte_v29',
      'list_partner_htes_v29',
      'get_coordinator_assignment_options',
      'validate_assignment_hte_program_v29'
    )
  `);
  assert.equal(functions.rows[0].count, 5);

  await db.exec(`
    insert into auth.users values
      ('10000000-0000-4000-8000-000000000001'),
      ('10000000-0000-4000-8000-000000000002');
    insert into public.org_units values
      ('20000000-0000-4000-8000-000000000001', null, 'campus', 'Goa Main Campus', 'Goa', true, null),
      ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'college', 'College of Engineering and Computational Sciences', 'CECS', true, null);
    insert into public.academic_programs values
      ('30000000-0000-4000-8000-000000000001', 'BSIT', 'Bachelor of Science in Information Technology', '20000000-0000-4000-8000-000000000002', true, null),
      ('30000000-0000-4000-8000-000000000002', 'BSCE', 'Bachelor of Science in Civil Engineering', '20000000-0000-4000-8000-000000000002', true, null),
      ('30000000-0000-4000-8000-000000000003', 'BSSE', 'Bachelor of Science in Sanitary Engineering', '20000000-0000-4000-8000-000000000002', true, null);
    insert into public.test_program_permissions values
      ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
      ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002'),
      ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003');
    insert into public.hte_organizations (id, name, verification_status) values
      ('40000000-0000-4000-8000-000000000001', 'BSIT Only HTE', 'verified'),
      ('40000000-0000-4000-8000-000000000002', 'Shared HTE', 'verified');
    insert into public.hte_academic_programs (hte_id, academic_program_id) values
      ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
      ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001'),
      ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002');
  `);
  await db.exec(`set "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001'`);
  const bsitVisible = await db.query(`select display_name from public.list_partner_htes_v29()`);
  assert.deepEqual(bsitVisible.rows.map((row) => row.display_name), ["BSIT Only HTE", "Shared HTE"]);
  const firstCreation = await db.query(`select public.create_partner_hte_v29(
    'New Partner', 'REG-001', 'Technology', '1 Main Street', 'Goa', 'Camarines Sur',
    'company@example.test', '+63 900 000 0000', 'Supervisor Name',
    'supervisor@example.test', '+63 911 111 1111',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    array['30000000-0000-4000-8000-000000000001']::uuid[]
  ) as id`);
  const repeatedCreation = await db.query(`select public.create_partner_hte_v29(
    'New Partner', 'REG-001', 'Technology', '1 Main Street', 'Goa', 'Camarines Sur',
    'company@example.test', '+63 900 000 0000', 'Supervisor Name',
    'supervisor@example.test', '+63 911 111 1111',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    array['30000000-0000-4000-8000-000000000001']::uuid[]
  ) as id`);
  assert.equal(firstCreation.rows[0].id, repeatedCreation.rows[0].id);
  const storedContacts = await db.query(`
    select contact_email, company_supervisor_email,
      (select count(*)::int from public.hte_academic_programs association where association.hte_id = organization.id) as association_count
    from public.hte_organizations organization where registration_number = 'REG-001'
  `);
  assert.deepEqual(storedContacts.rows, [{
    contact_email: "company@example.test",
    company_supervisor_email: "supervisor@example.test",
    association_count: 1,
  }]);
  await db.exec(`set "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002'`);
  const engineeringVisible = await db.query(`select display_name from public.list_partner_htes_v29()`);
  assert.deepEqual(engineeringVisible.rows.map((row) => row.display_name), ["Shared HTE"]);
  await assert.rejects(
    db.exec(`insert into public.hte_academic_programs (hte_id, academic_program_id) values
      ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002')`),
    /duplicate key value violates unique constraint/,
  );
  await db.close();
});

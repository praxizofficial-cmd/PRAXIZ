import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("partner HTE academic programs use a normalized, RLS-protected association", async () => {
  const migration = await read(
    "supabase/migrations/20261029030000_hte_academic_program_scope.sql",
  );
  assert.match(migration, /create table if not exists public\.hte_academic_programs/);
  assert.match(migration, /primary key \(hte_id, academic_program_id\)/);
  assert.match(migration, /alter table public\.hte_academic_programs enable row level security/);
  assert.match(migration, /private\.has_program_permission\(/);
  assert.match(migration, /create or replace function public\.list_authorized_hte_programs_v29/);
  assert.match(migration, /create or replace function public\.list_partner_htes_v29/);
  assert.match(migration, /jsonb_array_length\(coalesce\(associations\.items/);
  assert.doesNotMatch(migration, /service_role/);
});

test("partner HTE creation validates hierarchy, programs, and required supervisor details", async () => {
  const migration = await read(
    "supabase/migrations/20261029030000_hte_academic_program_scope.sql",
  );
  assert.match(migration, /create or replace function public\.create_partner_hte_v29/);
  assert.match(migration, /p_company_supervisor_name/);
  assert.match(migration, /p_company_supervisor_email/);
  assert.match(migration, /p_company_supervisor_contact_number/);
  assert.match(migration, /Select at least one authorized academic program/);
  assert.match(migration, /selected college does not belong to the selected campus/);
  assert.match(migration, /outside your authorized college scope/);
  assert.match(migration, /insert into public\.hte_academic_programs/);
});

test("coordinator UI preserves HTE representative workflow and shows detailed associations", async () => {
  const [app, service, route] = await Promise.all([
    read("app/PraxizApp.tsx"),
    read("app/services/praxiz-services.ts"),
    read("app/api/accounts/provision/route.ts"),
  ]);
  assert.match(service, /rpc\(\s*"list_authorized_hte_programs_v29"/);
  assert.match(service, /rpc\("create_partner_hte_v29"/);
  assert.match(service, /rpc\("list_partner_htes_v29"/);
  assert.match(app, /Academic association/);
  assert.match(app, /Company supervisor information/);
  assert.match(app, /Company contact information/);
  assert.match(app, /Create HTE Representative/);
  assert.match(app, /Supervisor information not yet provided/);
  assert.match(app, /No partner HTEs are currently associated with your authorized academic programs/);
  assert.match(app, /hte\.programIds\.includes\(programId\)/);
  assert.match(route, /rpc\(\s*"list_partner_htes_v29"/);
});

test("assignment options and writes enforce the HTE-program relationship on the server", async () => {
  const migration = await read(
    "supabase/migrations/20261029030000_hte_academic_program_scope.sql",
  );
  assert.match(migration, /create or replace function public\.get_coordinator_assignment_options/);
  assert.match(migration, /'programIds', organization\.program_ids/);
  assert.match(migration, /create trigger validate_assignment_hte_program_v29/);
  assert.match(migration, /not associated with the Student Intern academic program/);
});

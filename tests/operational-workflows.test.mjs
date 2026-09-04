import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("../database/20260903_operational_workflows.sql", import.meta.url), "utf8");

test("feedback remains assignment-bound and uses existing assignment authorization", () => {
  assert.match(sql, /internship_assignment_id uuid not null references public\.internship_assignments/);
  assert.match(sql, /private\.can_view_assignment\(internship_assignment_id\)/);
  assert.match(sql, /private\.can_manage_assignment\(assignment\.id\)/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all) on public\.internship_feedback to authenticated/i);
});

test("coordinator mutations retain program and permission boundaries", () => {
  assert.match(sql, /private\.has_program_permission\('hte-offerings:manage'/);
  assert.match(sql, /private\.has_program_permission\('internships:manage'/);
  assert.match(sql, /student\.academic_program_id = v_program_id/);
  assert.match(sql, /verification_status = 'verified'/);
});

test("assignment creation relies on existing lifecycle validation", () => {
  assert.match(sql, /case when p_submit_for_approval then 'pending_approval' else 'draft' end/);
  assert.match(sql, /insert into public\.internship_supervisors/);
  assert.doesNotMatch(sql, /disable row level security/i);
});

test("HTE verification is administrator-only", () => {
  assert.match(sql, /private\.has_any_permission\('users:manage'\)/);
  assert.match(sql, /where id = p_hte_id and deleted_at is null and verification_status = 'pending'/);
});

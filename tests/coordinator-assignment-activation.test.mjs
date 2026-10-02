import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../database/20260915_activate_coordinator_assignments.sql", import.meta.url), "utf8");
const assignmentMigration = readFileSync(new URL("../database/20260915_auto_link_hte_representative.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../app/PraxizApp.tsx", import.meta.url), "utf8");

test("coordinator activation removes the orphan approval state", () => {
  assert.match(migration, /replace\(v_definition, 'pending_approval', 'active'\)/);
  assert.match(migration, /assignment\.status = 'pending_approval'/);
  assert.match(migration, /set status = 'active'/);
  assert.match(assignmentMigration, /case when p_submit_for_approval then 'active' else 'draft' end/);
});

test("assignment creation explains activation and draft behavior", () => {
  assert.match(app, /Activating an assignment makes it available to the student immediately/);
  assert.match(app, /<option value="approval">Activate assignment<\/option>/);
  assert.doesNotMatch(app, /Assignment awaiting approval/);
});

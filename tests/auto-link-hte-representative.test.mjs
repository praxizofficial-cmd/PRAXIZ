import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../database/20260915_auto_link_hte_representative.sql", import.meta.url), "utf8");

test("coordinator assignment creation requires an active HTE representative", () => {
  assert.match(migration, /v_hte_supervisor_id uuid/);
  assert.match(migration, /representative\.hte_id = p_hte_id/);
  assert.match(migration, /role\.code = 'hte_supervisor'/);
  assert.match(migration, /raise exception 'The selected HTE does not have an active representative'/);
});

test("new assignments link the selected company representative as an HTE supervisor", () => {
  assert.match(migration, /insert into public\.internship_supervisors/);
  assert.match(migration, /v_assignment_id, v_hte_supervisor_id, 'hte', true/);
  assert.match(migration, /timezone\('utc', p_start_date::timestamp\)/);
});

test("existing assignments are backfilled without duplicating active HTE links", () => {
  assert.match(migration, /from public\.internship_assignments assignment/);
  assert.match(migration, /not exists \(\s*select 1\s*from public\.internship_supervisors existing/);
  assert.match(migration, /existing\.supervisor_type = 'hte'/);
  assert.match(migration, /assignment\.status not in \('completed', 'cancelled'\)/);
});

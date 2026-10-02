import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = readFileSync(new URL("../app/PraxizApp.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const services = readFileSync(new URL("../app/services/praxiz-services.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../database/20260915_coordinator_hte_representative_visibility.sql", import.meta.url), "utf8");

test("coordinators can resolve active representatives for verified partner HTEs", () => {
  assert.match(migration, /role\.code = 'internship_coordinator'/);
  assert.match(migration, /from public\.hte_representatives representative/);
  assert.match(migration, /organization\.verification_status = 'verified'/);
  assert.match(migration, /representative\.starts_on <= current_date/);
  assert.match(migration, /representative\.ends_on >= current_date/);
  assert.match(migration, /grant execute on function private\.can_view_user\(uuid\) to authenticated/);
});

test("representative name lookup fails explicitly instead of silently using a generic label", () => {
  const lookup = services.slice(services.indexOf("async function namesForUsers"), services.indexOf("export const evaluationService"));
  assert.match(lookup, /const \{ data, error \}/);
  assert.match(lookup, /if \(error\) throw new Error\(error\.message\)/);
});

test("the HTE dashboard preserves the original empty-state copy with table-column spacing", () => {
  assert.match(app, /className="muted-note table-empty-note">No interns are currently assigned within your authorized scope\./);
  assert.match(styles, /\.table-card > \.table-empty-note \{ padding-inline: 18px; \}/);
});

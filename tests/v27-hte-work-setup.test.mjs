import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("v27 HTE work setup keeps the editor conditional and prefilled", async () => {
  const app = await read("app/PraxizApp.tsx");
  assert.match(app, /const \[editingSetup, setEditingSetup\] = useState\(false\)/);
  assert.match(app, /\{editingSetup && <section/);
  assert.match(app, /active \? "Update work setup" : "Configure work setup"/);
  assert.match(app, /setHours\(String\(source\.dailyRequiredHours\)\)/);
  assert.match(app, /setEffectiveFrom\(source\.effectiveFrom\)/);
  assert.match(app, /setApplyToActive\(false\)/);
  assert.match(app, /setEditingSetup\(false\)/);
});

test("v27 work setup preserves daily-hour ownership and explicit propagation", async () => {
  const app = await read("app/PraxizApp.tsx");
  assert.match(app, /Total internship hours remain coordinator-owned/);
  assert.match(app, /PRAXIZ will not assume an[\s\S]*eight-hour day/);
  assert.match(app, /checked=\{applyToActive\}/);
  assert.match(app, /Review authorized correction/);
  assert.match(app, /Completed and historical (?:assignments|records) remain unchanged/);
  assert.match(app, /Correction reason \*/);
});

test("v27 HTE photo policy is compact, explicit, and non-retroactive", async () => {
  const component = await read("app/components/WeeklyLogPhotoEvidence.tsx");
  assert.match(component, /Current Activity Photo Policy/);
  assert.match(component, /Configure \/ Update Policy/);
  assert.match(component, /policy && editing &&/);
  assert.match(component, /setApply\(false\)/);
  assert.match(component, /Review changes/);
  assert.match(component, /Confirm and save policy/);
  assert.match(component, /Existing submitted and historical Weekly Logs are unchanged/);
});

test("v27 HTE Weekly Logs place review history before compact policy controls", async () => {
  const app = await read("app/PraxizApp.tsx");
  const history = app.indexOf("Weekly Log history");
  const policy = app.indexOf('{role === "hte" && <HtePhotoPolicy />}');
  assert.ok(history > 0 && policy > history);
  assert.match(app, /Search student, week, or accomplishments/);
  assert.match(app, /Filter Weekly Logs by status/);
  assert.match(app, /Newest submitted/);
  assert.match(app, /visibleRecords\.map/);
});

test("v27 partner HTE list distinguishes authorized daily hours from total internship hours", async () => {
  const [app, services, migration] = await Promise.all([
    read("app/PraxizApp.tsx"),
    read("app/services/praxiz-services.ts"),
    read("supabase/migrations/20261017010000_v28_partner_hte_scope.sql"),
  ]);
  assert.match(services, /rpc\("list_partner_htes_v28"\)/);
  assert.match(services, /dailyRequiredHours:/);
  assert.match(migration, /from public\.hte_daily_hour_configs config/);
  assert.match(migration, /config\.status = 'active'/);
  assert.match(app, /<th>Daily hours<\/th>/);
  assert.match(app, /Authorized daily hours/);
  assert.match(app, /Not configured/);
});

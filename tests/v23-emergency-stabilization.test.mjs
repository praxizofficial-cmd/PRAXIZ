import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../app/PraxizApp.tsx");
const services = read("../app/services/praxiz-services.ts");
const placementService = read("../app/services/placement-service.ts");
const provisioning = read("../app/api/accounts/provision/route.ts");
const aiRoute = read("../app/api/ai/route.ts");
const aiAssistant = read("../app/components/PraxizAiAssistant.tsx");
const styles = read("../app/globals.css");
const migration = read(
  "../supabase/migrations/20261011010000_v23_emergency_stabilization.sql",
);

test("V23 gives Placement Head a usable AI role and typed provider failures", () => {
  assert.match(aiRoute, /placement_head:/);
  assert.match(aiRoute, /generateWithOllama/);
  assert.match(aiAssistant, /ai-thinking-wave/);
  assert.match(aiAssistant, />Retry</);
});

test("V23 closes stale sessions before attendance reads and names the metric precisely", () => {
  assert.match(services, /async closeMyStaleSessions\(\): Promise<void>/);
  assert.match(services, /await attendanceService\.closeMyStaleSessions\(\)/);
  assert.match(app, /Verified session rate/);
});

test("V23 keeps placement records available when optional profile enrichment is denied", () => {
  const namesFor = placementService.slice(
    placementService.indexOf("async function namesFor"),
    placementService.indexOf("export const placementService"),
  );
  assert.match(namesFor, /const map = new Map/);
  assert.match(namesFor, /if \(error\) return map/);
});

test("V23 provisions Placement Head at institution scope and migrates existing scopes", () => {
  assert.match(provisioning, /scope: "institution_wide"/);
  assert.match(provisioning, /campus_org_unit_id: role === "coordinator"/);
  assert.match(migration, /role\.code = 'placement_head'/);
  assert.match(migration, /scope_org_unit_id = null/);
  assert.match(migration, /complete_placement_head_provisioning/);
});

test("V23 repairs placement permissions and coordinator requirement scope", () => {
  assert.match(migration, /grant select, insert on table public\.placement_compliance_reviews/);
  assert.match(migration, /grant select on table public\.required_file_formats/);
  assert.match(migration, /grant select, insert, update on table public\.required_file_format_versions/);
  assert.match(migration, /private\.coordinator_scope_includes/);
  assert.match(migration, /placement_requirements_read/);
});

test("V23 makes propagation opt-in and confirms HTE and requirement updates", () => {
  assert.match(app, /const \[confirmApply, setConfirmApply\] = useState\(false\)/);
  assert.match(app, /Review authorized correction/);
  assert.match(app, /placeholder="Enter hours"/);
  assert.match(app, /Apply required hours to active assignments\?/);
  assert.match(app, /Completed, cancelled, and historical records remain unchanged/);
});

test("V23 stabilizes the requested responsive UI elements", () => {
  assert.match(app, /function RegistrationSectionHeader/);
  assert.match(styles, /\.work-setup-stack/);
  assert.match(styles, /\.ai-thinking-wave/);
  assert.match(styles, /\.secure-form-note/);
  assert.match(styles, /\.sidebar-pin/);
});

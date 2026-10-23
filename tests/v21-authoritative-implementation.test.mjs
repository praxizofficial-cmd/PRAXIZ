import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(
  new URL("../app/PraxizApp.tsx", import.meta.url),
  "utf8",
);
const data = readFileSync(new URL("../app/data.ts", import.meta.url), "utf8");
const permissions = readFileSync(
  new URL("../app/permissions.ts", import.meta.url),
  "utf8",
);
const password = readFileSync(
  new URL("../app/components/PasswordInput.tsx", import.meta.url),
  "utf8",
);
const placement = readFileSync(
  new URL("../app/components/PlacementWorkspace.tsx", import.meta.url),
  "utf8",
);
const service = readFileSync(
  new URL("../app/services/placement-service.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261008000000_v21_placement_compliance.sql",
    import.meta.url,
  ),
  "utf8",
);
const styles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("V21 uses one accessible password primitive for account forms", () => {
  assert.match(password, /Show password/);
  assert.match(password, /Hide password/);
  assert.match(password, /Caps Lock is on/);
  assert.match(app, /<PasswordInput/);
});

test("Placement Head is a trusted role with focused navigation and permissions", () => {
  assert.match(data, /placement:\s*\{/);
  assert.match(data, /Student \/ Internship Overview|Students/);
  assert.match(data, /Document Compliance/);
  assert.match(data, /Required File Formats/);
  assert.match(permissions, /placement:manage/);
  assert.match(migration, /'placement_head'/);
  assert.match(migration, /enable row level security/);
});

test("placement compliance and controlled format versions preserve history", () => {
  assert.match(migration, /placement_compliance_submissions/);
  assert.match(
    migration,
    /unique\(requirement_id, coordinator_user_id, version_number\)/,
  );
  assert.match(migration, /required_file_format_versions/);
  assert.match(service, /submitCompliance/);
  assert.match(service, /submitFormatVersion/);
  assert.match(placement, /Records management/);
});

test("HTE daily hours and incomplete attendance are database-authoritative", () => {
  assert.match(migration, /daily_required_hours_snapshot/);
  assert.match(migration, /save_hte_daily_hour_config/);
  assert.match(migration, /p_apply_to_active_assignments/);
  assert.match(migration, /status = 'incomplete'/);
  assert.doesNotMatch(migration, /time_out[^\n]*=.*now\(\)/i);
});

test("academic term lifecycle requires explicit administrator finalization", () => {
  assert.match(migration, /pending_closure/);
  assert.match(migration, /transition_academic_term/);
  assert.match(migration, /Only a System Administrator may change/);
  assert.match(app, /Finalize academic term\?/);
});

test("responsive placement and AI surfaces use shared breakpoints", () => {
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /\.placement-summary-grid/);
  assert.match(styles, /\.ai-chat-dialog/);
  assert.match(placement, /<AIInsightsPanel/);
});

test("obsolete Faculty Supervisor is absent from V21 runtime files", () => {
  for (const source of [app, data, permissions, placement, service]) {
    assert.doesNotMatch(source, /Faculty Supervisor|faculty_supervisor/);
  }
});

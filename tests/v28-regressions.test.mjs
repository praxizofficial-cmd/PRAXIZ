import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Partner HTE directory is server-authorized and does not fail through chained client reads", async () => {
  const [service, migration] = await Promise.all([
    read("app/services/praxiz-services.ts"),
    read("supabase/migrations/20261017010000_v28_partner_hte_scope.sql"),
  ]);
  const method = service.slice(
    service.indexOf("async listPartnerHtes()"),
    service.indexOf("async createPartnerHte", service.indexOf("async listPartnerHtes()")),
  );
  assert.match(method, /rpc\("list_partner_htes_v28"\)/);
  assert.doesNotMatch(method, /from\("hte_daily_hour_configs"\)/);
  assert.match(migration, /private\.is_active_user\(auth\.uid\(\)\)/);
  assert.match(migration, /private\.user_has_role_code\(auth\.uid\(\), 'system_admin'\)/);
  assert.match(migration, /private\.user_has_role_code\(auth\.uid\(\), 'internship_coordinator'\)/);
  assert.match(migration, /revoke all on function public\.list_partner_htes_v28\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.list_partner_htes_v28\(\) to authenticated/);
});

test("AI failures preserve verified analytics and expose bounded retry states", async () => {
  const [placement, app, panel] = await Promise.all([
    read("app/components/PlacementWorkspace.tsx"),
    read("app/PraxizApp.tsx"),
    read("app/components/AIInsightsPanel.tsx"),
  ]);
  assert.match(placement, /const \[loadError, setLoadError\]/);
  assert.match(placement, /!loading && !loadError/);
  assert.match(placement, /useAIInsights\(\)/);
  assert.match(app, /useAIInsights\(\)/);
  assert.match(panel, /45_000/);
  assert.match(panel, /Try again/);
  assert.match(panel, /retryable/);
});

test("Support details retain message content in a compact purpose-labelled dialog", async () => {
  const [app, css] = await Promise.all([
    read("app/PraxizApp.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(app, /title="Support message details"/);
  assert.match(app, /<h4>Subject<\/h4>[\s\S]*selected\.subject/);
  assert.match(app, /<h4>Message<\/h4>[\s\S]*selected\.message/);
  assert.match(app, /Response history/);
  assert.match(css, /\.support-message-dialog \.feedback-detail-message\s*\{\s*min-height: 0;/);
});

test("v28 attendance migrations preserve historical event and verification rows", async () => {
  const migration = await read(
    "supabase/migrations/20261017000000_v28_attendance_accuracy.sql",
  );
  assert.match(migration, /assignment_attendance_progress_v28/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /merged_intervals/);
  assert.doesNotMatch(migration, /update\s+public\.attendance_(events|verifications)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.attendance_/i);
});

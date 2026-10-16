import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("support reply is server-authorized, provider-confirmed, rate-limited, and audited", async () => {
  const [route, migration] = await Promise.all([
    read("app/api/support/reply/route.ts"),
    read("supabase/migrations/20261016020000_v27_support_inbox_workflow.sql"),
  ]);
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /roles\.code", "system_admin"/);
  assert.match(route, /RESEND_API_KEY/);
  assert.match(route, /CONTACT_EMAIL_FROM/);
  assert.match(route, /Idempotency-Key/);
  assert.match(route, /support_message_replies/);
  assert.match(route, /delivery_status: "accepted"/);
  assert.match(route, /provider_message_id: providerId/);
  assert.match(route, /delivery_status: "failed"/);
  assert.match(route, /count: "exact"/);
  assert.match(route, /privacyAcknowledged !== true/);
  assert.match(migration, /support_message_case_events/);
  assert.match(migration, /case_status in \('open', 'resolved'\)/);
  assert.match(migration, /revoke update on public\.contact_messages from authenticated/);
});

test("support UI separates read state, case state, and truthful correspondence history", async () => {
  const [app, service] = await Promise.all([
    read("app/PraxizApp.tsx"),
    read("app/services/praxiz-services.ts"),
  ]);
  assert.match(app, /item\.readStatus === "Unread"/);
  assert.match(app, /item\.caseStatus === "Resolved"/);
  assert.match(app, /Response history/);
  assert.match(app, /contact-form address is unverified/);
  assert.match(app, /I confirm this reply contains no private account or internship information/);
  assert.match(app, /Resolve case/);
  assert.match(app, /Reopen case/);
  assert.match(service, /mark_support_message_read_v27/);
  assert.match(service, /set_support_case_status_v27/);
  assert.match(service, /\/api\/support\/reply/);
  assert.match(service, /deliveryStatus:/);
});

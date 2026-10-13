import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("HTE provisioning generates a unique PRAXIZ reference, keeps the external ID optional, and cleans failed completions", () => {
  const route = read("app/api/accounts/provision/route.ts");
  const dialog = read("app/PraxizApp.tsx");
  const migration = read(
    "database/20260923_hte_representative_reference_integrity.sql",
  );
  assert.match(
    route,
    /`HTER-\$\{new Date\(\)\.getFullYear\(\)\}-\$\{crypto\.randomUUID\(\)/,
  );
  assert.match(route, /\.ilike\("reference_no", candidate\)/);
  assert.match(route, /external_hte_id: externalHteId \|\| null/);
  assert.match(route, /completionError[\s\S]*deleteUser\(invited\.user\.id\)/);
  assert.match(
    dialog.replace(/\s+/g, " "),
    /Official HTE employee\/reference ID \(optional\)/,
  );
  assert.match(
    migration,
    /create unique index if not exists registration_applications_live_reference_unique/,
  );
  assert.match(
    migration,
    /where reference_no is not null and deleted_at is null/,
  );
});

test("analytics scope is server-authorized and calculated from RLS-visible records", () => {
  const route = read("app/api/ai/analytics/route.ts");
  const app = read("app/PraxizApp.tsx");
  const compactRoute = route.replace(/\s+/g, " ");
  assert.match(app, /Analysis scope/);
  assert.match(app, /\["overall", "Overall"\]/);
  assert.match(app, /\["hte", "By HTE"\]/);
  assert.match(app, /\["student", "Individual Student"\]/);
  assert.match(
    compactRoute,
    /\.in\("roles\.code", \["internship_coordinator", "placement_head"\]\)/,
  );
  assert.match(
    compactRoute,
    /if \(scope === "hte"\) assignmentQuery = assignmentQuery\.eq\("hte_id", hteId\)/,
  );
  assert.match(
    compactRoute,
    /if \(scope === "student"\) assignmentQuery = assignmentQuery\.eq\("student_user_id", studentId\)/,
  );
  assert.match(route, /\.from\("assignment_progress"\)/);
  assert.doesNotMatch(app, /attendanceVerified: attendanceMetric\.numerator/);
});

test("AI assistant is conversational and resolves role again on the server", () => {
  const assistant = read("app/components/PraxizAiAssistant.tsx");
  const route = read("app/api/ai/route.ts");
  assert.match(assistant, /ChatMessage\[\]/);
  assert.match(assistant, /roleSuggestions/);
  assert.match(assistant, /Shift\+Enter for a new line/);
  assert.match(assistant, /pending\.slice\(-12\)/);
  assert.match(route, /from\('role_assignments'\)/);
  assert.match(route, /The trusted backend resolved the current role as/);
  assert.match(
    route,
    /Do not give instructions for actions outside the verified role boundary/,
  );
});

test("V14 layout fixes preserve local table scrolling and responsive chat", () => {
  const css = read("app/globals.css");
  const attendance = read("app/components/StudentAttendanceHistory.tsx");
  assert.match(css, /auth-help-group \.secure-form-note/);
  assert.match(css, /attendance-filter-group/);
  assert.match(
    css,
    /stats-grid\.three \+ \.card\.table-card \+ \.card\.table-card/,
  );
  assert.match(css, /ai-chat-conversation/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(attendance, /className="table-scroll"/);
});

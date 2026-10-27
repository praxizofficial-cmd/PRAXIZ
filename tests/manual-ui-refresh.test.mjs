import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { notificationTarget } from "../lib/notification-target.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("notification links remain in the active role and reject external or normalized traversal paths", () => {
  for (const role of ["student", "hte", "coordinator", "placement", "admin"]) {
    assert.equal(notificationTarget(`/${role}/notifications?record=123`, role), `/${role}/notifications?record=123`);
    assert.equal(notificationTarget("https://example.com", role), null);
    assert.equal(notificationTarget("//example.com", role), null);
    assert.equal(notificationTarget(`/${role}/../other/dashboard`, role), null);
    assert.equal(notificationTarget(`/${role}/%2e%2e/other/dashboard`, role), null);
    assert.equal(notificationTarget(`/${role}/test\\other`, role), null);
  }
  assert.equal(notificationTarget("/admin/registrations", "student"), null);
  assert.equal(notificationTarget("/student/feedback?feedback=123", "student"), "/student/feedback?feedback=123");
});

test("admin notification navigation retains the existing role and permission guards", () => {
  const app = read("app/PraxizApp.tsx");
  const services = read("app/services/praxiz-services.ts");
  assert.match(read("app/data.ts"), /href: "\/admin\/notifications"/);
  assert.match(app, /hasPermission\(role, item\.permission\)/);
  assert.match(app, /shown\.filter\(\(record\) => record\.unread\)/);
  assert.match(app, /Mark all visible as read/);
  assert.match(app, /view\(item, true\)/);
  assert.match(services, /\.eq\("user_id", userId\)/);
  assert.match(services, /rpc\("mark_notification_read"/);
});

test("weekly editor keeps mounted step fields, draft lock and explicit submission review", () => {
  const app = read("app/PraxizApp.tsx");
  const editor = app.slice(app.indexOf("function StudentWeeklyLogDialog"), app.indexOf("function WeeklyLogDialog"));
  for (const step of [0, 1, 2]) assert.ok(editor.includes(`hidden={step !== ${step}}`));
  assert.match(editor, /saveLock\.current/);
  assert.match(editor, /id: log\?\.id/);
  assert.match(editor, /if \(!reviewing\) \{ setReviewing\(true\); return; \}/);
  assert.match(editor, /WeeklyLogPhotoEvidence log=\{log\} editable/);
  assert.match(editor, /!\["Draft", "Needs Revision"\]\.includes\(log\.status\)/);
});

test("public dashboard uses explicitly illustrative values and no protected data services", () => {
  const dashboard = read("app/components/FloatingDashboard.tsx");
  assert.match(dashboard, /Illustrative preview/);
  assert.match(dashboard, /not live institutional data/);
  assert.doesNotMatch(dashboard, /supabase|createClient|fetch\(/);
  assert.match(dashboard, /prefers-reduced-motion/);
  assert.match(dashboard, /removeEventListener\("pointermove"/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../database/20260907_student_feedback_delivery.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../app/services/praxiz-services.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../app/PraxizApp.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../app/data.ts", import.meta.url), "utf8");

test("student feedback remains assignment-scoped and coordinator or HTE authored", () => {
  assert.match(migration, /private\.can_manage_assignment\(assignment\.id\)/);
  assert.match(migration, /supervisor\.supervisor_user_id = auth\.uid\(\)/);
  assert.match(migration, /student_user_id/);
  assert.match(migration, /Internship Coordinator/);
  assert.match(migration, /HTE Supervisor/);
});

test("feedback persistence survives a notification delivery failure", () => {
  const feedbackInsert = migration.indexOf("insert into public.internship_feedback");
  const exceptionBlock = migration.indexOf("begin\n    insert into public.notifications");
  assert.ok(feedbackInsert >= 0 && exceptionBlock > feedbackInsert);
  assert.match(migration, /exception when others then/);
  assert.match(migration, /internship_feedback', feedback_id/);
  assert.match(migration, /notification_recipients \(notification_id, user_id\)/);
  assert.match(migration, /New feedback received/);
  assert.match(migration, /on conflict \(deduplication_key\) do nothing/);
});

test("student navigation, read-only detail, and exact notification deep links are wired", () => {
  assert.match(navigation, /label: "Feedback", href: "\/student\/feedback"/);
  assert.match(service, /related_entity_type === "internship_feedback"/);
  assert.match(service, /`\/student\/feedback\?feedback=\$\{notification\.related_entity_id\}`/);
  assert.match(app, /canCreate \? <ActionButton/);
  assert.match(app, /Author role/);
  assert.match(app, /Feedback message/);
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\("feedback"\)/);
});

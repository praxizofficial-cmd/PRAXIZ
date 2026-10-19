import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app/PraxizApp.tsx", import.meta.url), "utf8");

test("v27 registrations prioritize pending work and expose compact statistics", () => {
  const table = app.slice(app.indexOf("function RegistrationTable"), app.indexOf("function RegistrationsPage"));
  assert.match(table, /registration-stats/);
  assert.match(table, /Pending/);
  assert.match(table, /Under review/);
  assert.match(table, /rank\(left\.status\) - rank\(right\.status\)/);
});

test("v27 reviewed registrations open as read-only history instead of a static label", () => {
  const dialog = app.slice(app.indexOf("function RegistrationReviewDialog"), app.indexOf("function RegistrationTable"));
  assert.match(dialog, /const reviewable/);
  assert.match(dialog, /already been reviewed/);
  assert.match(app, /View details/);
  assert.match(dialog, /reviewable \? <>/);
});

test("v27 registration review retains strict decision boundaries", () => {
  assert.match(app, /A reason is required when rejecting a registration/);
  assert.match(app, /Approve and activate/);
  assert.match(app, /PRAXIZ HTE Representative reference/);
  assert.match(app, /External HTE ID/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app/PraxizApp.tsx", import.meta.url), "utf8");
const services = await readFile(new URL("../app/services/praxiz-services.ts", import.meta.url), "utf8");

test("v27 feedback keeps read state separate from follow-up state", () => {
  assert.match(app, /Read state and follow-up workflow are tracked independently/);
  assert.match(app, /<span>Follow-up<\/span>/);
  assert.match(app, /<span>Read status<\/span>/);
  assert.match(app, /<StatusBadge status=\{item\.status\}/);
  assert.match(app, /<StatusBadge status=\{item\.readStatus\}/);
});

test("v27 coordinator feedback filters use assignment-derived section and HTE", () => {
  assert.match(app, /sectionFilter/);
  assert.match(app, /hteFilter/);
  assert.match(app, /item\.section === sectionFilter/);
  assert.match(app, /item\.hte === hteFilter/);
  assert.match(services, /student_profiles\(section\)/);
  assert.match(services, /hte_organizations\(name,trade_name\)/);
});

test("v27 feedback details remain read-only and open inside PRAXIZ", () => {
  const detail = app.slice(
    app.indexOf("function FeedbackDetailDialog"),
    app.indexOf("function FeedbackPage"),
  );
  assert.match(detail, /<Dialog title="Feedback details"/);
  assert.match(detail, /record\.message/);
  assert.match(detail, /record\.section/);
  assert.match(detail, /record\.hte/);
  assert.doesNotMatch(detail, /<textarea/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app/PraxizApp.tsx", import.meta.url), "utf8");
const services = await readFile(new URL("../app/services/praxiz-services.ts", import.meta.url), "utf8");

test("v27 coordinator compliance filters combine section, HTE, term, status, and search", () => {
  const page = app.slice(app.indexOf("function DocumentsPage"), app.indexOf("function EvaluationsPage"));
  assert.match(page, /Document compliance filters/);
  assert.match(page, /sectionFilter/);
  assert.match(page, /hteFilter/);
  assert.match(page, /termFilter/);
  assert.match(page, /statusFilter/);
  assert.match(page, /visiblePercent/);
  assert.match(page, /No requirements in this phase match the selected filters/);
});

test("v27 document filter metadata comes from the authorized assignment relation", () => {
  assert.match(services, /student_profiles\(section\)/);
  assert.match(services, /hte_organizations\(name,trade_name\)/);
  assert.match(services, /academic_terms\(term,academic_years\(label\)\)/);
  assert.match(services, /section: studentProfile\?\.section/);
  assert.match(services, /hte: hte\?\.trade_name/);
});

test("v27 document withdrawal remains separate from review and preserves history", () => {
  const page = app.slice(app.indexOf("function DocumentsPage"), app.indexOf("function EvaluationsPage"));
  assert.match(page, /Unsubmit document/);
  assert.match(page, /The original version remains in PRAXIZ history/);
  assert.match(page, /record\.submissionId/);
  assert.match(page, /record\.status === "Under Review"/);
});

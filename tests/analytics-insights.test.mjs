import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifiedDataFallback, detectAnalyticsConcerns } from "../app/analytics-insights.ts";

const evidence = (overrides = {}) => ({
  attendance: 50,
  attendanceVerified: 2,
  attendanceApplicable: 4,
  dailyLogApproval: 80,
  dailyLogsApproved: 4,
  dailyLogsApplicable: 5,
  evaluationFinalization: 100,
  evaluationsFinalized: 2,
  evaluationsApplicable: 2,
  documentCompliance: 40,
  documentsCompliant: 2,
  documentsRequired: 5,
  assignedInterns: 3,
  concerns: 1,
  ...overrides,
});

test("deterministic concern detection preserves configured thresholds", () => {
  const concerns = detectAnalyticsConcerns(evidence());
  assert.deepEqual(concerns.map((item) => [item.indicator, item.severity]), [
    ["Attendance verification", "high"],
    ["Document compliance", "high"],
  ]);
  assert.match(concerns[0].message, /2 of 4 applicable sessions/);
});

test("verified-data fallback uses only supplied aggregate indicators", () => {
  const input = evidence();
  const concerns = detectAnalyticsConcerns(input);
  const result = buildVerifiedDataFallback(input, concerns);
  assert.match(result.summary, /3 assigned interns/);
  assert.match(result.summary, /document compliance at 40%/i);
  assert.ok(result.patterns.every((item) => /%/.test(item)));
  assert.ok(result.recommendations.some((item) => /existing follow-up rule/.test(item)));
  assert.doesNotMatch(JSON.stringify(result), /student name|grade|diagnosis/i);
});

test("fallback clearly handles an absence of applicable records", () => {
  const input = evidence({
    attendance: null,
    attendanceVerified: 0,
    attendanceApplicable: 0,
    dailyLogApproval: null,
    dailyLogsApproved: 0,
    dailyLogsApplicable: 0,
    evaluationFinalization: null,
    evaluationsFinalized: 0,
    evaluationsApplicable: 0,
    documentCompliance: null,
    documentsCompliant: 0,
    documentsRequired: 0,
    assignedInterns: 0,
    concerns: 0,
  });
  const result = buildVerifiedDataFallback(input, detectAnalyticsConcerns(input));
  assert.match(result.summary, /no applicable workflow-completion indicators/i);
  assert.match(result.patterns[0], /No applicable attendance/i);
  assert.match(result.recommendations[0], /Continue routine monitoring/i);
});

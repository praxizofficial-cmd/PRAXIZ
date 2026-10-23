import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  liveDataUnavailableReply,
  requestsLiveInternshipData,
} from "../app/ai-guardrails.ts";
import { validateAnalyticsPercentages } from "../app/analytics-insights.ts";

const evidence = {
  attendance: 75,
  attendanceVerified: 3,
  attendanceApplicable: 4,
  dailyLogApproval: null,
  dailyLogsApproved: 0,
  dailyLogsApplicable: 0,
  evaluationFinalization: 100,
  evaluationsFinalized: 1,
  evaluationsApplicable: 1,
  documentCompliance: 50,
  documentsCompliant: 1,
  documentsRequired: 2,
  assignedInterns: 2,
  concerns: 0,
};

test("assistant refuses direct real-record requests instead of hallucinating", () => {
  assert.equal(
    requestsLiveInternshipData("What is my attendance percentage?"),
    true,
  );
  assert.equal(
    requestsLiveInternshipData("Which of our interns need attention?"),
    true,
  );
  assert.equal(
    requestsLiveInternshipData("Show my current evaluation score"),
    true,
  );
  assert.match(liveDataUnavailableReply, /cannot check live internship records/);
});

test("assistant still permits navigation and workflow guidance", () => {
  assert.equal(requestsLiveInternshipData("How do I check my attendance?"), false);
  assert.equal(
    requestsLiveInternshipData("Explain the HTE evaluation workflow"),
    false,
  );
  assert.equal(
    requestsLiveInternshipData("How can I submit a Weekly Log?"),
    false,
  );
});

test("live-data refusal happens only after authenticated role verification", async () => {
  const route = await readFile(
    new URL("../app/api/ai/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    route.indexOf("if (authError || !user)") <
      route.lastIndexOf("requestsLiveInternshipData"),
  );
  assert.ok(
    route.indexOf("account_status !== 'active'") <
      route.lastIndexOf("requestsLiveInternshipData"),
  );
  assert.doesNotMatch(route, /service[_-]?role/i);
});

test("analytics permits only evidence-supported percentages", () => {
  assert.doesNotThrow(() =>
    validateAnalyticsPercentages(
      {
        summary: "75% of sessions were verified.",
        patterns: ["Document compliance is 50%."],
        recommendations: [
          "Review unfinished evaluations; finalization is 100%.",
        ],
      },
      evidence,
    ),
  );
  assert.throws(
    () =>
      validateAnalyticsPercentages(
        {
          summary: "Attendance improved to 93%.",
          patterns: [],
          recommendations: [],
        },
        evidence,
      ),
    /unsupported percentage/,
  );
  assert.throws(
    () =>
      validateAnalyticsPercentages(
        {
          summary: "Weekly Log completion is 0%.",
          patterns: [],
          recommendations: [],
        },
        evidence,
      ),
    /unsupported percentage/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { detectAnalyticsConcerns, parseAnalyticsModelResponse } from "../app/analytics-insights.ts";
import { ollamaGenerateUrl, ollamaHeaders } from "../lib/ollama.ts";

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

test("cloud and local Ollama base URLs resolve to one generate endpoint", () => {
  assert.equal(ollamaGenerateUrl("https://ollama.com"), "https://ollama.com/api/generate");
  assert.equal(ollamaGenerateUrl("https://ollama.com/api/"), "https://ollama.com/api/generate");
  assert.equal(ollamaGenerateUrl("http://localhost:11434"), "http://localhost:11434/api/generate");
});

test("cloud authentication stays server-side in the authorization header", () => {
  assert.deepEqual(ollamaHeaders(" secret-key "), {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: "Bearer secret-key",
  });
  assert.equal("Authorization" in ollamaHeaders(), false);
});

test("analytics JSON is extracted and sanitized without structured output mode", () => {
  const result = parseAnalyticsModelResponse(`Here is the analysis:\n\`\`\`json\n{
    "summary": "  Verified overview  ",
    "patterns": [" First ", 7, "", "Second"],
    "recommendations": [" Review attendance "]
  }\n\`\`\``);
  assert.deepEqual(result, {
    summary: "Verified overview",
    patterns: ["First", "Second"],
    recommendations: ["Review attendance"],
  });
});

test("analytics parser rejects a response without a usable summary", () => {
  assert.throws(() => parseAnalyticsModelResponse('{"patterns":[]}'), /empty analysis/);
});

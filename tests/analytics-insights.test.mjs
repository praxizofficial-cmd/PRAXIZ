import assert from "node:assert/strict";
import test from "node:test";
import {
  detectAnalyticsConcerns,
  parseAnalyticsModelResponse,
} from "../app/analytics-insights.ts";
import {
  OllamaRequestError,
  ollamaErrorResponse,
  ollamaGenerateUrl,
  ollamaHeaders,
  ollamaTagsUrl,
} from "../lib/ollama.ts";

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
  assert.deepEqual(
    concerns.map((item) => [item.indicator, item.severity]),
    [
      ["Attendance verification", "high"],
      ["Document compliance", "high"],
    ],
  );
  assert.match(concerns[0].message, /2 of 4 applicable sessions/);
});

test("cloud and local Ollama base URLs resolve to one generate endpoint", () => {
  assert.equal(
    ollamaGenerateUrl("https://ollama.com"),
    "https://ollama.com/api/generate",
  );
  assert.equal(
    ollamaGenerateUrl("https://ollama.com/api/"),
    "https://ollama.com/api/generate",
  );
  assert.equal(
    ollamaGenerateUrl("http://localhost:11434"),
    "http://localhost:11434/api/generate",
  );
  assert.equal(ollamaTagsUrl("https://ollama.com/api/"), "https://ollama.com/api/tags");
});

test("cloud authentication stays server-side in the authorization header", () => {
  assert.deepEqual(ollamaHeaders(" secret-key "), {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: "Bearer secret-key",
  });
  assert.equal("Authorization" in ollamaHeaders(), false);
});

test("analytics JSON is strictly parsed and sanitized", () => {
  const result =
    parseAnalyticsModelResponse(`{
    "summary": "  Verified overview  ",
    "patterns": [" First ", "", "Second"],
    "recommendations": [" Review attendance "]
  }`);
  assert.deepEqual(result, {
    summary: "Verified overview",
    patterns: ["First", "Second"],
    recommendations: ["Review attendance"],
  });
});

test("analytics parser rejects a response without a usable summary", () => {
  assert.throws(
    () => parseAnalyticsModelResponse('{"patterns":[]}'),
    /invalid analytics schema/,
  );
});

test("analytics parser rejects markdown-wrapped or mixed-type model output", () => {
  assert.throws(() => parseAnalyticsModelResponse('```json\n{"summary":"x","patterns":[],"recommendations":[]}\n```'));
  assert.throws(() => parseAnalyticsModelResponse('{"summary":"x","patterns":[7],"recommendations":[]}'), /invalid analytics schema/);
});

test("provider failure categories use safe status codes and retry hints", () => {
  assert.deepEqual(ollamaErrorResponse(new OllamaRequestError("TIMEOUT")), {
    status: 504,
    body: {
      error: "PRAXIZ AI took too long to respond. Please try again.",
      kind: "TIMEOUT",
      retryable: true,
    },
  });
  assert.equal(ollamaErrorResponse(new OllamaRequestError("CONFIGURATION_MISSING")).status, 503);
  assert.equal(ollamaErrorResponse(new OllamaRequestError("MODEL_OUTPUT_INVALID")).status, 502);
  assert.equal(ollamaErrorResponse(new Error("database failure")).status, 500);
});

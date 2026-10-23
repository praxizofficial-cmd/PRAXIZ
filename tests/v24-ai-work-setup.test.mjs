import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../app/PraxizApp.tsx");
const assistant = read("../app/components/PraxizAiAssistant.tsx");
const insightsPanel = read("../app/components/AIInsightsPanel.tsx");
const generalRoute = read("../app/api/ai/route.ts");
const analyticsRoute = read("../app/api/ai/analytics/route.ts");
const ollama = read("../lib/ollama.ts");
const styles = read("../app/globals.css");
const envExample = read("../.env.example");

test("V24 keeps Ollama configuration centralized, server-only, and safely classified", () => {
  assert.match(ollama, /CONFIGURATION_MISSING/);
  assert.match(ollama, /PROVIDER_UNREACHABLE/);
  assert.match(ollama, /MODEL_OUTPUT_INVALID/);
  assert.match(ollama, /Intentionally omit provider URLs/);
  assert.match(envExample, /OLLAMA_BASE_URL=/);
  assert.match(envExample, /OLLAMA_MODEL=llama3\.2/);
  assert.match(envExample, /OLLAMA_API_KEY=/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_OLLAMA/);
});

test("V24 preserves trusted role authorization on both AI routes", () => {
  assert.match(generalRoute, /supabase\.auth\.getUser/);
  assert.match(generalRoute, /account_status !== 'active'/);
  assert.match(analyticsRoute, /profiles.*account_status/);
  assert.match(analyticsRoute, /internship_coordinator.*placement_head/);
  assert.match(analyticsRoute, /format: "json"/);
});

test("V24 exposes branded thinking and only meaningful retry controls", () => {
  assert.match(assistant, /<strong>PRAXIZ AI<\/strong><span>Thinking…<\/span>/);
  assert.match(assistant, /retryable &&/);
  assert.match(insightsPanel, /Generating AI insights/);
  assert.match(insightsPanel, /retryable &&/);
});

test("V24 work setup uses stacked surfaces and purpose-built responsive rows", () => {
  assert.match(app, /work-setup-stack/);
  assert.match(app, /work-setup-form-row-three/);
  assert.match(app, /work-setup-option/);
  assert.match(app, /Correction reason \*/);
  assert.match(app, /No daily-hours configuration has been recorded yet/);
  assert.match(styles, /\.work-setup-stack[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.work-setup-form-row-three/);
  assert.match(styles, /\.work-setup-actions/);
  assert.doesNotMatch(app, /className=\{`work-setup-layout/);
});

test("V24 validates daily hours, dates, and audited admin correction reasons", () => {
  assert.match(app, /parsedHours < 0\.25 \|\| parsedHours > 24/);
  assert.match(app, /effectiveTo < effectiveFrom/);
  assert.match(app, /reason\.trim\(\)\.length < 5/);
  assert.match(app, /Historical and completed assignments will not be changed/);
});

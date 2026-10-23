import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Coordinator and Placement Head share the same AI insights presentation", async () => {
  const [coordinator, placement, panel] = await Promise.all([
    read("app/PraxizApp.tsx"),
    read("app/components/PlacementWorkspace.tsx"),
    read("app/components/AIInsightsPanel.tsx"),
  ]);
  assert.match(coordinator, /<AIInsightsPanel/);
  assert.match(placement, /<AIInsightsPanel/);
  assert.match(coordinator, /useAIInsights\(\)/);
  assert.match(placement, /useAIInsights\(\)/);
  assert.match(panel, /AI Performance Insights/);
  assert.match(panel, /Overall Assessment/);
  assert.match(panel, /Key Observations/);
  assert.match(panel, /Recommended Actions/);
  assert.match(panel, /Supporting Indicators/);
});

test("loading is indeterminate, descriptive, accessible, and result-shaped", async () => {
  const [panel, css] = await Promise.all([
    read("app/components/AIInsightsPanel.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(panel, /Generating AI insights/);
  assert.match(panel, /Preparing verified records/);
  assert.match(panel, /Reviewing performance indicators/);
  assert.match(panel, /Generating insights/);
  assert.match(panel, /role="status" aria-live="polite"/);
  assert.match(panel, /Overall Assessment[\s\S]*Key Observations[\s\S]*Recommended Actions/);
  assert.doesNotMatch(panel, />35%<|>70%<|>100%</);
  assert.match(css, /\.ai-indeterminate-track/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ai-indeterminate-track span/);
});

test("regeneration preserves a prior result and failed refreshes are non-destructive", async () => {
  const panel = await read("app/components/AIInsightsPanel.tsx");
  const requestStart = panel.slice(
    panel.indexOf("const generate = useCallback"),
    panel.indexOf("const workflowStages"),
  );
  assert.match(requestStart, /setState\(\(current\) => \(\{[\s\S]*\.\.\.current,[\s\S]*loading: true/);
  assert.doesNotMatch(requestStart, /result:\s*null,[\s\S]*loading:\s*true/);
  assert.match(panel, /Previous insights remain visible until the[\s\S]*new response is ready/);
  assert.match(panel, /result: \{[\s\S]*generatedAt:[\s\S]*data\.generatedAt[\s\S]*undefined,[\s\S]*scopeKey/);
  assert.doesNotMatch(panel, /assignmentsAnalyzed/);
});

test("scope reset aborts pending work and prevents stale response contamination", async () => {
  const panel = await read("app/components/AIInsightsPanel.tsx");
  assert.match(panel, /const resetForScope = useCallback\(\(\) => \{[\s\S]*requestSequence\.current \+= 1;[\s\S]*abortController\.current\?\.abort\(\)/);
  assert.match(panel, /if \(sequence !== requestSequence\.current\) return;/);
  assert.match(panel, /const visibleResult = result\?\.scopeKey === scopeKey \? result : null/);
});

test("empty, error, and advisory states use shared institutional language", async () => {
  const panel = await read("app/components/AIInsightsPanel.tsx");
  assert.match(panel, /No analytics available for this scope/);
  assert.match(panel, /Unable to generate AI insights/);
  assert.match(panel, /Verified\s+PRAXIZ\s+records and[\s\S]*authorized human decisions remain authoritative/);
  assert.match(panel, /status === 401/);
  assert.match(panel, /status === 403/);
  assert.match(panel, /PROVIDER_UNREACHABLE/);
});

test("long report content wraps and the shared layout is responsive", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.ai-report-section p[\s\S]*overflow-wrap: anywhere/);
  assert.match(css, /\.ai-observation-list li,[\s\S]*overflow-wrap: anywhere/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.ai-workflow-stages/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.ai-insights-header/);
});

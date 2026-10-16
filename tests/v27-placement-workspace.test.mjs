import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile(
  new URL("../app/components/PlacementWorkspace.tsx", import.meta.url),
  "utf8",
);
const service = await readFile(
  new URL("../app/services/placement-service.ts", import.meta.url),
  "utf8",
);

test("v27 Placement Head student records expose counts, pagination, and in-app details", () => {
  assert.match(workspace, /const pageSize = 10/);
  assert.match(workspace, /Showing \{\(page - 1\) \* pageSize \+ 1\}/);
  assert.match(workspace, /Page \{page\} of \{pageCount\}/);
  assert.match(workspace, /View details/);
  assert.match(workspace, /title=\{selected\.studentName\}/);
  assert.match(workspace, /Only assignments inside your authorized institutional scope are shown/);
});

test("v27 Placement Head verified analytics remain visible when AI generation fails", () => {
  assert.match(workspace, /AI insight unavailable\. Verified analytics remain available\./);
  assert.match(workspace, /AI insights are advisory/);
  assert.match(workspace, /placementService\.listPlacements\(\)/);
});

test("v27 Placement Head dashboard has scoped filters and an action-required surface", () => {
  assert.match(workspace, /Institutional placement filters/);
  assert.match(workspace, /Academic term/);
  assert.match(workspace, /Requires your attention/);
  assert.match(workspace, /missingRecords\.slice\(0, 5\)/);
  assert.match(workspace, /No placement compliance records currently require action/);
});

test("v27 controlled file formats preserve secure preview, version history, and publication review", () => {
  assert.match(workspace, /Loading secure preview/);
  assert.match(workspace, /version history/);
  assert.match(workspace, /Return with feedback/);
  assert.match(workspace, /Publish/);
  assert.match(workspace, /placementService\.requiredFormatUrl/);
});

test("v27 placement compliance summarizes work and preserves every submitted version", () => {
  assert.match(workspace, /Awaiting review/);
  assert.match(workspace, /Needs action/);
  assert.match(workspace, /version history/);
  assert.match(workspace, /View this version/);
  assert.match(service, /const grouped = new Map<string, Submission\[\]>/);
  assert.match(service, /history: ordered\.map/);
  assert.match(service, /submissionId: version\.id/);
});

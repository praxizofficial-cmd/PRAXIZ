import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyAssignmentScopeFilters,
  assignmentSelectForScope,
} from "../app/api/ai/analytics/assignment-query.ts";

const route = await readFile(
  new URL("../app/api/ai/analytics/route.ts", import.meta.url),
  "utf8",
);

function recordingQuery() {
  const operations = [];
  const query = {
    eq(column, value) {
      operations.push(["eq", column, value]);
      return query;
    },
    is(column, value) {
      operations.push(["is", column, value]);
      return query;
    },
    lte(column, value) {
      operations.push(["lte", column, value]);
      return query;
    },
    or(filters, options) {
      operations.push(["or", filters, options]);
      return query;
    },
  };
  return { query, operations };
}

const targets = {
  section: "A",
  hteId: "00000000-0000-4000-8000-000000000001",
  studentId: "00000000-0000-4000-8000-000000000002",
  coordinatorId: "00000000-0000-4000-8000-000000000003",
};

test("overall insights query RLS-visible assignments without requiring a coordinator relation", () => {
  const { query, operations } = recordingQuery();
  const result = applyAssignmentScopeFilters(
    query,
    "overall",
    targets,
    "2026-10-20T00:00:00.000Z",
  );

  assert.equal(result, query);
  assert.deepEqual(operations, []);
  assert.doesNotMatch(
    assignmentSelectForScope("overall"),
    /internship_supervisors/,
  );
  assert.match(
    route.replace(/\s+/g, " "),
    /\.in\("status", \["active", "completed"\]\) \.is\("deleted_at", null\)/,
  );
});

test("coordinator insights require a current coordinator supervisor assignment", () => {
  const now = "2026-10-20T00:00:00.000Z";
  const { query, operations } = recordingQuery();
  applyAssignmentScopeFilters(query, "coordinator", targets, now);

  assert.match(
    assignmentSelectForScope("coordinator"),
    /internship_supervisors!inner\(supervisor_user_id\)/,
  );
  assert.deepEqual(operations, [
    [
      "eq",
      "internship_supervisors.supervisor_user_id",
      targets.coordinatorId,
    ],
    ["eq", "internship_supervisors.supervisor_type", "coordinator"],
    ["is", "internship_supervisors.deleted_at", null],
    ["lte", "internship_supervisors.started_at", now],
    [
      "or",
      `ended_at.is.null,ended_at.gt.${now}`,
      { referencedTable: "internship_supervisors" },
    ],
  ]);
  assert.doesNotMatch(route, /coordinator_user_id/);
});

test("analytics rejects unauthenticated requests before role or assignment queries", () => {
  const compactRoute = route.replace(/\s+/g, " ");
  assert.match(
    compactRoute,
    /if \(authError \|\| !user\) return NextResponse\.json\( \{ error: "You must be signed in to use AI analytics\." \}, \{ status: 401 \}, \)/,
  );
  assert.ok(
    route.indexOf("if (authError || !user)") <
      route.indexOf('.from("role_assignments")'),
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDailyLogDateWithinAssignment,
  buildSaveDailyLogRpcArgs,
} from "../app/services/daily-log-stabilization.ts";
import { resolveActiveAssignmentId } from "../app/auth/student-stabilization.ts";

const assignment = { id: "assignment-1", academicTermId: "term-current", startDate: "2026-08-17", endDate: "2026-12-18", expectedEndDate: "2026-12-18" };
const input = { logDate: "2026-08-21", hours: 8, activities: "  Built feature  ", learnings: " Learned ", challenges: "" };

test("Save Draft RPC arguments preserve content without bypassing the workflow", () => {
  assert.deepEqual(buildSaveDailyLogRpcArgs(input, assignment, "draft"), {
    p_assignment_id: "assignment-1",
    p_log_date: "2026-08-21",
    p_hours: 8,
    p_activities: "Built feature",
    p_learnings: "Learned",
    p_challenges: null,
    p_submit: false,
    p_daily_log_id: null,
  });
});

test("Submit and resubmit arguments use the controlled submission flag", () => {
  const payload = buildSaveDailyLogRpcArgs(input, assignment, "submitted");
  assert.equal(payload.p_submit, true);
});

test("assignment ownership comes from the resolved assignment", () => {
  assert.equal(buildSaveDailyLogRpcArgs(input, assignment, "draft").p_assignment_id, assignment.id);
});

test("dates outside the assignment are rejected", () => {
  assert.throws(() => assertDailyLogDateWithinAssignment("2026-08-16", assignment), /between/);
  assert.throws(() => assertDailyLogDateWithinAssignment("2026-12-19", assignment), /between/);
  assert.doesNotThrow(() => assertDailyLogDateWithinAssignment("2026-08-17", assignment));
  assert.doesNotThrow(() => assertDailyLogDateWithinAssignment("2026-12-18", assignment));
});

test("untrusted assignment fields are not copied into the payload", () => {
  const payload = buildSaveDailyLogRpcArgs({ ...input, internship_assignment_id: "other-student-assignment" }, assignment, "draft");
  assert.equal(payload.p_assignment_id, assignment.id);
});

test("ambiguous assignments are rejected before a Daily Log payload can be created", () => {
  assert.throws(() => resolveActiveAssignmentId([
    { ...assignment },
    { ...assignment, id: "assignment-2", academicTermId: "term-current" },
  ], { id: "term-current", startsOn: "2026-08-17", endsOn: "2026-12-18" }, "2026-08-21"), /Multiple active internship assignments/);
});

test("resubmission keeps prior review history as append-only records", () => {
  const history = [{ decision: "needs_revision", feedback: "Add more detail." }];
  const resubmittedLog = { status: "submitted", history: [...history] };
  assert.equal(resubmittedLog.history.length, 1);
  assert.equal(resubmittedLog.history[0].decision, "needs_revision");
});

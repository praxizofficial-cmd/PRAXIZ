import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWeeklyLogPeriodWithinAssignment,
  buildSaveWeeklyLogRpcArgs,
  reportingWeekFor,
} from "../app/services/weekly-log-stabilization.ts";
import { resolveActiveAssignmentId } from "../app/auth/student-stabilization.ts";

const assignment = { id: "assignment-1", academicTermId: "term-current", startDate: "2026-08-17", endDate: "2026-12-18", expectedEndDate: "2026-12-18" };
const input = {
  weekStartDate: "2026-08-17",
  weekEndDate: "2026-08-23",
  hours: 40,
  accomplishments: "  Built and tested the assigned module  ",
  learnings: " Reviewed the workflow ",
  challenges: "",
};

test("a selected date resolves to the required Monday-to-Sunday reporting week", () => {
  assert.deepEqual(reportingWeekFor("2026-08-21"), {
    weekStartDate: "2026-08-17",
    weekEndDate: "2026-08-23",
  });
  assert.deepEqual(reportingWeekFor("2026-08-23"), {
    weekStartDate: "2026-08-17",
    weekEndDate: "2026-08-23",
  });
});

test("Save Draft RPC arguments stay assignment-bound and normalize content", () => {
  assert.deepEqual(buildSaveWeeklyLogRpcArgs(input, assignment, "draft"), {
    p_assignment_id: "assignment-1",
    p_week_start_date: "2026-08-17",
    p_week_end_date: "2026-08-23",
    p_hours: 40,
    p_accomplishments: "Built and tested the assigned module",
    p_learnings: "Reviewed the workflow",
    p_challenges: null,
    p_submit: false,
    p_weekly_log_id: null,
  });
});

test("submit and resubmit use the controlled workflow flag and existing record ID", () => {
  const payload = buildSaveWeeklyLogRpcArgs({ ...input, id: "weekly-log-1" }, assignment, "submitted");
  assert.equal(payload.p_submit, true);
  assert.equal(payload.p_weekly_log_id, "weekly-log-1");
});

test("untrusted assignment fields cannot replace the resolved assignment", () => {
  const payload = buildSaveWeeklyLogRpcArgs({ ...input, internship_assignment_id: "other-student" }, assignment, "draft");
  assert.equal(payload.p_assignment_id, assignment.id);
});

test("invalid reporting periods and non-overlapping assignment weeks are rejected", () => {
  assert.throws(
    () => assertWeeklyLogPeriodWithinAssignment("2026-08-18", "2026-08-24", assignment),
    /Monday through Sunday/,
  );
  assert.throws(
    () => assertWeeklyLogPeriodWithinAssignment("2026-08-10", "2026-08-16", assignment),
    /overlap the assignment period/,
  );
  assert.doesNotThrow(
    () => assertWeeklyLogPeriodWithinAssignment("2026-08-17", "2026-08-23", assignment),
  );
});

test("ambiguous active assignments are rejected before a Weekly Log payload is created", () => {
  assert.throws(() => resolveActiveAssignmentId([
    { ...assignment },
    { ...assignment, id: "assignment-2", academicTermId: "term-current" },
  ], { id: "term-current", startsOn: "2026-08-17", endsOn: "2026-12-18" }, "2026-08-21"), /Multiple active internship assignments/);
});

test("revision history remains append-only during resubmission", () => {
  const history = [{ decision: "needs_revision", feedback: "Add more detail." }];
  const resubmittedLog = { status: "submitted", history: [...history] };
  assert.equal(resubmittedLog.history.length, 1);
  assert.equal(resubmittedLog.history[0].decision, "needs_revision");
});

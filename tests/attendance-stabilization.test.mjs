import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  attendanceDecisionBlock,
  resolveAttendancePair,
} from "../app/services/attendance-stabilization.ts";

const migration = fs.readFileSync(
  new URL("../database/20260912_attendance_review_pair_consistency.sql", import.meta.url),
  "utf8",
);

const completeOriginal = {
  timeInAt: "2026-09-08T09:32:00.000Z",
  timeOutAt: "2026-09-08T09:33:00.000Z",
};

test("complete original pair is authoritative and verifiable", () => {
  const result = resolveAttendancePair({ original: completeOriginal });
  assert.equal(result.authoritativePair, "original");
  assert.equal(result.complete, true);
  assert.equal(attendanceDecisionBlock("Pending Verification", "verified", result, false), null);
  assert.match(migration, /select 1 as priority, time_in_at, time_out_at from original_pair/);
  assert.match(migration, /greatest\(\s*1,/);
  assert.match(migration, /for update;/);
});

test("missing event blocks Verify with a specific reason", () => {
  const result = resolveAttendancePair({ original: { timeInAt: completeOriginal.timeInAt, timeOutAt: null } });
  assert.equal(result.complete, false);
  assert.match(attendanceDecisionBlock("Pending Verification", "verified", result, false), /Time Out is missing/);
});

test("approved complete correction is authoritative without mixing pairs", () => {
  const result = resolveAttendancePair({
    original: { timeInAt: completeOriginal.timeInAt, timeOutAt: null },
    correction: { status: "approved", timeInAt: "2026-09-08T08:00:00.000Z", timeOutAt: "2026-09-08T16:00:00.000Z" },
  });
  assert.equal(result.authoritativePair, "approved_corrected");
  assert.equal(result.timeInAt, "2026-09-08T08:00:00.000Z");
  assert.equal(result.timeOutAt, "2026-09-08T16:00:00.000Z");
});

test("pending correction cannot complete an original pair", () => {
  const result = resolveAttendancePair({
    original: { timeInAt: completeOriginal.timeInAt, timeOutAt: null },
    correction: { status: "pending", timeInAt: completeOriginal.timeInAt, timeOutAt: completeOriginal.timeOutAt },
  });
  assert.equal(result.authoritativePair, "none");
  assert.match(result.blockingReason, /pending approval/);

  const completeButPending = resolveAttendancePair({
    original: completeOriginal,
    correction: { status: "pending", timeInAt: completeOriginal.timeInAt, timeOutAt: completeOriginal.timeOutAt },
  });
  assert.equal(completeButPending.complete, true);
  assert.match(attendanceDecisionBlock("Pending Verification", "verified", completeButPending, false), /pending approval/);
});

test("invalid chronology blocks Verify", () => {
  const result = resolveAttendancePair({ original: { timeInAt: completeOriginal.timeOutAt, timeOutAt: completeOriginal.timeInAt } });
  assert.equal(result.complete, false);
  assert.match(result.blockingReason, /later than Time In/);
});

test("already verified and rejected sessions reject repeat transitions", () => {
  const result = resolveAttendancePair({ original: completeOriginal });
  assert.match(attendanceDecisionBlock("Verified", "verified", result, false), /already been verified/);
  assert.match(attendanceDecisionBlock("Rejected", "verified", result, false), /already been rejected/);
});

test("Flag can report an incomplete pair but requires remarks", () => {
  const result = resolveAttendancePair({ original: { timeInAt: completeOriginal.timeInAt, timeOutAt: null } });
  assert.match(attendanceDecisionBlock("Pending Verification", "flagged", result, false), /reason is required/);
  assert.equal(attendanceDecisionBlock("Pending Verification", "flagged", result, true), null);
});

test("Reject preserves the remarks requirement", () => {
  const result = resolveAttendancePair({ original: completeOriginal });
  assert.match(attendanceDecisionBlock("Pending Verification", "rejected", result, false), /reason is required/);
  assert.equal(attendanceDecisionBlock("Pending Verification", "rejected", result, true), null);
});

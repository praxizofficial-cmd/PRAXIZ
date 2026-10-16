import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  attendanceDurationMinutes,
  attendanceDecisionBlock,
  originalAttendancePair,
  resolveAttendancePair,
} from "../app/services/attendance-stabilization.ts";

const migration = fs.readFileSync(
  new URL(
    "../database/20260912_attendance_review_pair_consistency.sql",
    import.meta.url,
  ),
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
  assert.equal(
    attendanceDecisionBlock("Pending Verification", "verified", result, false),
    null,
  );
  assert.match(
    migration,
    /select 1 as priority, time_in_at, time_out_at from original_pair/,
  );
  assert.match(migration, /greatest\(\s*1,/);
  assert.match(migration, /for update;/);
});

test("authoritative duration handles required v28 minute, overnight, and incomplete cases", () => {
  assert.equal(
    attendanceDurationMinutes({
      timeInAt: "2026-10-16T00:00:00.000Z",
      timeOutAt: "2026-10-16T04:00:00.000Z",
    }),
    240,
  );
  assert.equal(
    attendanceDurationMinutes({
      timeInAt: "2026-10-16T05:00:00.000Z",
      timeOutAt: "2026-10-16T09:00:00.000Z",
    }),
    240,
  );
  assert.equal(
    attendanceDurationMinutes({
      timeInAt: "2026-10-16T00:00:00.000Z",
      timeOutAt: "2026-10-16T09:00:00.000Z",
    }),
    540,
  );
  assert.equal(
    attendanceDurationMinutes({
      timeInAt: "2026-10-16T12:45:00.000Z",
      timeOutAt: "2026-10-16T14:02:00.000Z",
    }),
    77,
  );
  assert.equal(
    attendanceDurationMinutes({
      timeInAt: "2026-10-16T15:00:00.000Z",
      timeOutAt: "2026-10-16T18:00:00.000Z",
    }),
    180,
  );
  assert.equal(
    attendanceDurationMinutes({
      timeInAt: "2026-10-16T00:00:00.000Z",
      timeOutAt: null,
    }),
    null,
  );
});

test("duplicate/retried punches resolve to earliest Time In and latest Time Out regardless of row order", () => {
  const pair = originalAttendancePair([
    { event_type: "time_out", occurred_at: "2026-10-16T09:02:00.000Z" },
    { event_type: "time_in", occurred_at: "2026-10-16T08:45:00.000Z" },
    { event_type: "time_out", occurred_at: "2026-10-16T10:02:00.000Z" },
    { event_type: "time_in", occurred_at: "2026-10-16T08:46:00.000Z" },
  ]);
  assert.deepEqual(pair, {
    timeInAt: "2026-10-16T08:45:00.000Z",
    timeOutAt: "2026-10-16T10:02:00.000Z",
  });
  assert.equal(attendanceDurationMinutes(pair), 77);
});

test("database migration rounds elapsed seconds once and prevents overlap double counting", async () => {
  const v28 = fs.readFileSync(
    new URL(
      "../supabase/migrations/20261017000000_v28_attendance_accuracy.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(v28, /round\(extract\(epoch from \(time_out_at - time_in_at\)\) \/ 60\.0\)/);
  assert.match(v28, /min\(event\.occurred_at\).*event_type = 'time_in'/s);
  assert.match(v28, /max\(event\.occurred_at\).*event_type = 'time_out'/s);
  assert.match(v28, /merged_intervals/);
  assert.match(v28, /security_invoker = true/);
  assert.doesNotMatch(v28, /update\s+public\.attendance_(events|verifications)/i);
});

test("missing event blocks Verify with a specific reason", () => {
  const result = resolveAttendancePair({
    original: { timeInAt: completeOriginal.timeInAt, timeOutAt: null },
  });
  assert.equal(result.complete, false);
  assert.match(
    attendanceDecisionBlock("Pending Verification", "verified", result, false),
    /Time Out is missing/,
  );
});

test("approved complete correction is authoritative without mixing pairs", () => {
  const result = resolveAttendancePair({
    original: { timeInAt: completeOriginal.timeInAt, timeOutAt: null },
    correction: {
      status: "approved",
      timeInAt: "2026-09-08T08:00:00.000Z",
      timeOutAt: "2026-09-08T16:00:00.000Z",
    },
  });
  assert.equal(result.authoritativePair, "approved_corrected");
  assert.equal(result.timeInAt, "2026-09-08T08:00:00.000Z");
  assert.equal(result.timeOutAt, "2026-09-08T16:00:00.000Z");
});

test("pending correction cannot complete an original pair", () => {
  const result = resolveAttendancePair({
    original: { timeInAt: completeOriginal.timeInAt, timeOutAt: null },
    correction: {
      status: "pending",
      timeInAt: completeOriginal.timeInAt,
      timeOutAt: completeOriginal.timeOutAt,
    },
  });
  assert.equal(result.authoritativePair, "none");
  assert.match(result.blockingReason, /pending approval/);

  const completeButPending = resolveAttendancePair({
    original: completeOriginal,
    correction: {
      status: "pending",
      timeInAt: completeOriginal.timeInAt,
      timeOutAt: completeOriginal.timeOutAt,
    },
  });
  assert.equal(completeButPending.complete, true);
  assert.match(
    attendanceDecisionBlock(
      "Pending Verification",
      "verified",
      completeButPending,
      false,
    ),
    /pending approval/,
  );
});

test("invalid chronology blocks Verify", () => {
  const result = resolveAttendancePair({
    original: {
      timeInAt: completeOriginal.timeOutAt,
      timeOutAt: completeOriginal.timeInAt,
    },
  });
  assert.equal(result.complete, false);
  assert.match(result.blockingReason, /later than Time In/);
});

test("already verified and rejected sessions reject repeat transitions", () => {
  const result = resolveAttendancePair({ original: completeOriginal });
  assert.match(
    attendanceDecisionBlock("Verified", "verified", result, false),
    /already been verified/,
  );
  assert.match(
    attendanceDecisionBlock("Rejected", "verified", result, false),
    /already been rejected/,
  );
});

test("Flag can report an incomplete pair but requires remarks", () => {
  const result = resolveAttendancePair({
    original: { timeInAt: completeOriginal.timeInAt, timeOutAt: null },
  });
  assert.match(
    attendanceDecisionBlock("Pending Verification", "flagged", result, false),
    /reason is required/,
  );
  assert.equal(
    attendanceDecisionBlock("Pending Verification", "flagged", result, true),
    null,
  );
});

test("Reject preserves the remarks requirement", () => {
  const result = resolveAttendancePair({ original: completeOriginal });
  assert.match(
    attendanceDecisionBlock("Pending Verification", "rejected", result, false),
    /reason is required/,
  );
  assert.equal(
    attendanceDecisionBlock("Pending Verification", "rejected", result, true),
    null,
  );
});

export type AttendancePairSource = "original" | "approved_corrected" | "none";

export type AttendancePair = {
  timeInAt: string | null;
  timeOutAt: string | null;
};

export type AttendanceCorrection = AttendancePair & {
  status: "pending" | "approved" | "rejected";
};

export type AttendancePairResolution = {
  authoritativePair: AttendancePairSource;
  timeInAt: string | null;
  timeOutAt: string | null;
  complete: boolean;
  blockingReason: string | null;
};

export type AttendanceEventTimestamp = {
  event_type: "time_in" | "time_out";
  occurred_at: string;
};

export type ReviewableAttendanceStatus =
  | "Active"
  | "Pending Verification"
  | "Verified"
  | "Flagged"
  | "Rejected"
  | "Voided"
  | "Incomplete";

const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve retried/duplicated server events deterministically. The first Time In
 * and last Time Out are the same immutable boundaries used by the database and
 * monthly DTR snapshot. Array order from a nested PostgREST relation is not an
 * attendance rule and must never decide the credited pair.
 */
export function originalAttendancePair(
  events: AttendanceEventTimestamp[],
): AttendancePair {
  const timeIns = events
    .filter((event) => event.event_type === "time_in")
    .map((event) => event.occurred_at)
    .sort();
  const timeOuts = events
    .filter((event) => event.event_type === "time_out")
    .map((event) => event.occurred_at)
    .sort();
  return {
    timeInAt: timeIns[0] ?? null,
    timeOutAt: timeOuts.at(-1) ?? null,
  };
}

/**
 * Convert one authoritative pair to whole credited minutes once, at the UI/
 * database boundary. Raw timestamps remain the source of truth. Rounding the
 * final elapsed seconds matches the minute precision shown in PRAXIZ while
 * avoiding repeated decimal-hour rounding.
 */
export function attendanceDurationMinutes(
  pair: AttendancePair,
): number | null {
  if (inspectPair(pair)) return null;
  const elapsedMs =
    new Date(pair.timeOutAt as string).getTime() -
    new Date(pair.timeInAt as string).getTime();
  return Math.max(1, Math.round(elapsedMs / 60_000));
}

function inspectPair(pair: AttendancePair): string | null {
  if (!pair.timeInAt) return "Time In is missing";
  if (!pair.timeOutAt) return "Time Out is missing";

  const timeIn = new Date(pair.timeInAt).getTime();
  const timeOut = new Date(pair.timeOutAt).getTime();
  if (
    !Number.isFinite(timeIn) ||
    !Number.isFinite(timeOut) ||
    timeOut <= timeIn
  ) {
    return "Time Out must be later than Time In";
  }
  if (timeOut - timeIn > MAX_SESSION_MS)
    return "The attendance duration exceeds 24 hours";
  return null;
}

/**
 * Resolves one complete attendance pair without mixing original and corrected
 * timestamps. Original server events remain authoritative whenever complete.
 */
export function resolveAttendancePair(input: {
  original: AttendancePair;
  correction?: AttendanceCorrection | null;
}): AttendancePairResolution {
  const pendingCorrection = input.correction?.status === "pending";
  const originalIssue = inspectPair(input.original);
  if (!originalIssue) {
    return {
      authoritativePair: "original",
      ...input.original,
      complete: true,
      blockingReason: pendingCorrection
        ? "An attendance correction is still pending approval"
        : null,
    };
  }

  const correction = input.correction;
  if (correction?.status === "approved") {
    const correctionIssue = inspectPair(correction);
    if (!correctionIssue) {
      return {
        authoritativePair: "approved_corrected",
        timeInAt: correction.timeInAt,
        timeOutAt: correction.timeOutAt,
        complete: true,
        blockingReason: null,
      };
    }
    return {
      authoritativePair: "none",
      timeInAt: null,
      timeOutAt: null,
      complete: false,
      blockingReason: `The approved correction is incomplete: ${correctionIssue}`,
    };
  }

  const correctionState = pendingCorrection
    ? " An attendance correction is still pending approval."
    : "";
  return {
    authoritativePair: "none",
    timeInAt: null,
    timeOutAt: null,
    complete: false,
    blockingReason: `${originalIssue}.${correctionState}`.trim(),
  };
}

export function attendanceDecisionBlock(
  status: ReviewableAttendanceStatus,
  decision: "verified" | "flagged" | "rejected",
  resolution: AttendancePairResolution,
  hasRemarks: boolean,
): string | null {
  if (status === "Verified")
    return "This attendance session has already been verified.";
  if (status === "Rejected")
    return "This attendance session has already been rejected.";
  if (status === "Voided")
    return "A voided attendance session cannot be reviewed.";
  if (status === "Incomplete" && decision === "verified") {
    return "An incomplete attendance session cannot be verified. Correct, flag, or reject the record first.";
  }
  if (status === "Active")
    return "This attendance session is still active. Record Time Out before review.";
  if (
    decision === "verified" &&
    (!resolution.complete || resolution.blockingReason)
  ) {
    return `${resolution.blockingReason ?? "A complete attendance pair is required"}.`;
  }
  if (decision !== "verified" && !hasRemarks) {
    return `A reason is required when ${decision === "flagged" ? "flagging" : "rejecting"} a session.`;
  }
  return null;
}

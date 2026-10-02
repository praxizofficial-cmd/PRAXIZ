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

export type ReviewableAttendanceStatus =
  | "Active"
  | "Pending Verification"
  | "Verified"
  | "Flagged"
  | "Rejected"
  | "Voided";

const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

function inspectPair(pair: AttendancePair): string | null {
  if (!pair.timeInAt) return "Time In is missing";
  if (!pair.timeOutAt) return "Time Out is missing";

  const timeIn = new Date(pair.timeInAt).getTime();
  const timeOut = new Date(pair.timeOutAt).getTime();
  if (!Number.isFinite(timeIn) || !Number.isFinite(timeOut) || timeOut <= timeIn) {
    return "Time Out must be later than Time In";
  }
  if (timeOut - timeIn > MAX_SESSION_MS) return "The attendance duration exceeds 24 hours";
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
      blockingReason: pendingCorrection ? "An attendance correction is still pending approval" : null,
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

  const correctionState = pendingCorrection ? " An attendance correction is still pending approval." : "";
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
  if (status === "Verified") return "This attendance session has already been verified.";
  if (status === "Rejected") return "This attendance session has already been rejected.";
  if (status === "Voided") return "A voided attendance session cannot be reviewed.";
  if (status === "Active") return "This attendance session is still active. Record Time Out before review.";
  if (decision === "verified" && (!resolution.complete || resolution.blockingReason)) {
    return `${resolution.blockingReason ?? "A complete attendance pair is required"}.`;
  }
  if (decision !== "verified" && !hasRemarks) {
    return `A reason is required when ${decision === "flagged" ? "flagging" : "rejecting"} a session.`;
  }
  return null;
}

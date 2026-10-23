export type AnalyticsEvidence = {
  attendance: number | null;
  attendanceVerified: number;
  attendanceApplicable: number;
  dailyLogApproval: number | null;
  dailyLogsApproved: number;
  dailyLogsApplicable: number;
  evaluationFinalization: number | null;
  evaluationsFinalized: number;
  evaluationsApplicable: number;
  documentCompliance: number | null;
  documentsCompliant: number;
  documentsRequired: number;
  assignedInterns: number;
  concerns: number;
};

export type AnalyticsConcern = {
  severity: "high" | "medium" | "low";
  indicator: string;
  message: string;
};

export type AnalyticsModelResult = {
  summary: string;
  patterns: string[];
  recommendations: string[];
};

export function detectAnalyticsConcerns(evidence: AnalyticsEvidence): AnalyticsConcern[] {
  const detected: AnalyticsConcern[] = [];
  const add = (severity: AnalyticsConcern["severity"], indicator: string, value: number, numerator: number, denominator: number, unit: string) => {
    detected.push({ severity, indicator, message: `${indicator} is ${value}% (${numerator} of ${denominator} ${unit}).` });
  };

  if (evidence.attendanceApplicable > 0 && evidence.attendance !== null && evidence.attendance < 80) {
    add(evidence.attendance < 60 ? "high" : "medium", "Attendance verification", evidence.attendance, evidence.attendanceVerified, evidence.attendanceApplicable, "applicable sessions");
  }
  if (evidence.dailyLogsApplicable > 0 && evidence.dailyLogApproval !== null && evidence.dailyLogApproval < 75) {
    add(evidence.dailyLogApproval < 50 ? "high" : "medium", "Weekly Log approval", evidence.dailyLogApproval, evidence.dailyLogsApproved, evidence.dailyLogsApplicable, "submitted Weekly Logs");
  }
  if (evidence.documentsRequired > 0 && evidence.documentCompliance !== null && evidence.documentCompliance < 75) {
    add(evidence.documentCompliance < 50 ? "high" : "medium", "Document compliance", evidence.documentCompliance, evidence.documentsCompliant, evidence.documentsRequired, "required documents");
  }
  if (evidence.evaluationsApplicable > 0 && evidence.evaluationFinalization !== null && evidence.evaluationFinalization < 50) {
    add("medium", "Evaluation finalization", evidence.evaluationFinalization, evidence.evaluationsFinalized, evidence.evaluationsApplicable, "reports");
  }
  return detected;
}

export function parseAnalyticsModelResponse(raw: string): AnalyticsModelResult {
  const parsed = JSON.parse(raw.trim()) as {
    summary?: unknown;
    patterns?: unknown;
    recommendations?: unknown;
  };
  const cleanList = (value: unknown) => Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

  if (
    !summary ||
    !Array.isArray(parsed.patterns) ||
    !Array.isArray(parsed.recommendations) ||
    parsed.patterns.some((item) => typeof item !== "string") ||
    parsed.recommendations.some((item) => typeof item !== "string")
  ) {
    throw new Error("Ollama returned an invalid analytics schema");
  }

  return {
    summary,
    patterns: cleanList(parsed.patterns),
    recommendations: cleanList(parsed.recommendations),
  };
}

/**
 * Reject percentage claims that are not present in the server-calculated
 * evidence. This is a narrow fail-closed check, not a general truth guarantee.
 */
export function validateAnalyticsPercentages(
  result: AnalyticsModelResult,
  evidence: AnalyticsEvidence,
): void {
  const verifiedValues = [
    evidence.attendance,
    evidence.dailyLogApproval,
    evidence.evaluationFinalization,
    evidence.documentCompliance,
  ].filter((value): value is number => value !== null);
  const allText = [
    result.summary,
    ...result.patterns,
    ...result.recommendations,
  ].join(" ");
  const percentages = [...allText.matchAll(/\b(\d+(?:\.\d+)?)\s*%/g)];

  if (
    percentages.some(
      (match) => !verifiedValues.includes(Number(match[1])),
    )
  ) {
    throw new Error("AI analysis contained an unsupported percentage");
  }
}

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

type Metric = {
  label: string;
  value: number | null;
  numerator: number;
  denominator: number;
  unit: string;
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
    add(evidence.dailyLogApproval < 50 ? "high" : "medium", "Daily log approval", evidence.dailyLogApproval, evidence.dailyLogsApproved, evidence.dailyLogsApplicable, "submitted logs");
  }
  if (evidence.documentsRequired > 0 && evidence.documentCompliance !== null && evidence.documentCompliance < 75) {
    add(evidence.documentCompliance < 50 ? "high" : "medium", "Document compliance", evidence.documentCompliance, evidence.documentsCompliant, evidence.documentsRequired, "required documents");
  }
  if (evidence.evaluationsApplicable > 0 && evidence.evaluationFinalization !== null && evidence.evaluationFinalization < 50) {
    add("medium", "Evaluation finalization", evidence.evaluationFinalization, evidence.evaluationsFinalized, evidence.evaluationsApplicable, "reports");
  }
  return detected;
}

export function buildVerifiedDataFallback(evidence: AnalyticsEvidence, detected: AnalyticsConcern[]) {
  const metrics: Metric[] = [
    { label: "Attendance verification", value: evidence.attendance, numerator: evidence.attendanceVerified, denominator: evidence.attendanceApplicable, unit: "applicable sessions" },
    { label: "Daily log approval", value: evidence.dailyLogApproval, numerator: evidence.dailyLogsApproved, denominator: evidence.dailyLogsApplicable, unit: "submitted logs" },
    { label: "Document compliance", value: evidence.documentCompliance, numerator: evidence.documentsCompliant, denominator: evidence.documentsRequired, unit: "required documents" },
    { label: "Evaluation finalization", value: evidence.evaluationFinalization, numerator: evidence.evaluationsFinalized, denominator: evidence.evaluationsApplicable, unit: "reports" },
  ];
  const applicable = metrics.filter((metric): metric is Metric & { value: number } => metric.value !== null && metric.denominator > 0).sort((a, b) => a.value - b.value);
  const internLabel = `${evidence.assignedInterns} assigned intern${evidence.assignedInterns === 1 ? "" : "s"}`;
  const lowest = applicable[0];
  const summary = !applicable.length
    ? `PRAXIZ currently has ${internLabel}, but no applicable workflow-completion indicators are available yet.`
    : detected.length
      ? `Verified records for ${internLabel} show ${detected.length} indicator${detected.length === 1 ? "" : "s"} requiring coordinator review. The lowest current indicator is ${lowest.label.toLowerCase()} at ${lowest.value}%.`
      : `Verified records for ${internLabel} do not trigger a configured concern threshold. Continue monitoring as new records are verified.`;

  const patterns = applicable.slice(0, 4).map((metric) => `${metric.label} is ${metric.value}% (${metric.numerator} of ${metric.denominator} ${metric.unit}).`);
  if (!patterns.length) patterns.push("No applicable attendance, Daily Log, document, or evaluation completion record is available yet.");

  const recommendations = detected.map((item) => `Review ${item.indicator.toLowerCase()} in its authorized PRAXIZ workflow and verify any incomplete records.`);
  if (evidence.concerns > 0) recommendations.push(`Review the ${evidence.concerns} intern${evidence.concerns === 1 ? "" : "s"} currently identified by the existing follow-up rule.`);
  if (!recommendations.length) recommendations.push("Continue routine monitoring and regenerate the interpretation when additional verified records become available.");

  return {
    summary,
    patterns: patterns.slice(0, 6),
    recommendations: recommendations.slice(0, 6),
  };
}

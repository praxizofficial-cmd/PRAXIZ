export type DailyLogAssignment = {
  id: string;
  startDate: string;
  endDate: string;
};

export type DailyLogInput = {
  id?: string;
  logDate: string;
  hours: number;
  activities: string;
  learnings?: string;
  challenges?: string;
};

export function assertDailyLogDateWithinAssignment(logDate: string, assignment: DailyLogAssignment): void {
  if (logDate < assignment.startDate || logDate > assignment.endDate) {
    throw new Error(`The daily log date must be between ${assignment.startDate} and ${assignment.endDate}.`);
  }
}

export function buildSaveDailyLogRpcArgs(
  input: DailyLogInput,
  assignment: DailyLogAssignment,
  status: "draft" | "submitted",
) {
  assertDailyLogDateWithinAssignment(input.logDate, assignment);
  return {
    p_assignment_id: assignment.id,
    p_log_date: input.logDate,
    p_hours: input.hours,
    p_activities: input.activities.trim(),
    p_learnings: input.learnings?.trim() || null,
    p_challenges: input.challenges?.trim() || null,
    p_submit: status === "submitted",
    p_daily_log_id: input.id ?? null,
  };
}

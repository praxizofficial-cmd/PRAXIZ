export type WeeklyLogAssignment = {
  id: string;
  startDate: string;
  endDate: string;
};

export type WeeklyLogInput = {
  id?: string;
  weekStartDate: string;
  weekEndDate: string;
  hours: number;
  accomplishments: string;
  learnings?: string;
  challenges?: string;
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function reportingWeekFor(dateValue: string): { weekStartDate: string; weekEndDate: string } {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Select a valid reporting week.");
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + 6);
  return { weekStartDate: isoDate(date), weekEndDate: isoDate(end) };
}

export function assertWeeklyLogPeriodWithinAssignment(
  weekStartDate: string,
  weekEndDate: string,
  assignment: WeeklyLogAssignment,
): void {
  const normalized = reportingWeekFor(weekStartDate);
  if (normalized.weekStartDate !== weekStartDate || normalized.weekEndDate !== weekEndDate) {
    throw new Error("A reporting week must run from Monday through Sunday.");
  }
  if (weekEndDate < assignment.startDate || weekStartDate > assignment.endDate) {
    throw new Error(`The reporting week must overlap the assignment period from ${assignment.startDate} to ${assignment.endDate}.`);
  }
}

export function buildSaveWeeklyLogRpcArgs(
  input: WeeklyLogInput,
  assignment: WeeklyLogAssignment,
  status: "draft" | "submitted",
) {
  assertWeeklyLogPeriodWithinAssignment(input.weekStartDate, input.weekEndDate, assignment);
  return {
    p_assignment_id: assignment.id,
    p_week_start_date: input.weekStartDate,
    p_week_end_date: input.weekEndDate,
    p_hours: input.hours,
    p_accomplishments: input.accomplishments.trim(),
    p_learnings: input.learnings?.trim() || null,
    p_challenges: input.challenges?.trim() || null,
    p_submit: status === "submitted",
    p_weekly_log_id: input.id ?? null,
  };
}

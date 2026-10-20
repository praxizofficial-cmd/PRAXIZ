export type AnalysisScope =
  | "overall"
  | "section"
  | "hte"
  | "student"
  | "coordinator";

type AssignmentScopeTargets = {
  section: string;
  hteId: string;
  studentId: string;
  coordinatorId: string;
};

type AssignmentFilterBuilder = {
  eq(column: string, value: string): AssignmentFilterBuilder;
  is(column: string, value: null): AssignmentFilterBuilder;
  lte(column: string, value: string): AssignmentFilterBuilder;
  or(
    filters: string,
    options?: { referencedTable?: string },
  ): AssignmentFilterBuilder;
};

const BASE_ASSIGNMENT_SELECT =
  "id,student_user_id,hte_id,status,student_profiles!inner(section)";

export function assignmentSelectForScope(scope: AnalysisScope) {
  return scope === "coordinator"
    ? `${BASE_ASSIGNMENT_SELECT},internship_supervisors!inner(supervisor_user_id)`
    : BASE_ASSIGNMENT_SELECT;
}

export function applyAssignmentScopeFilters<T extends AssignmentFilterBuilder>(
  query: T,
  scope: AnalysisScope,
  targets: AssignmentScopeTargets,
  now: string,
) {
  if (scope === "hte") query.eq("hte_id", targets.hteId);
  if (scope === "student")
    query.eq("student_user_id", targets.studentId);
  if (scope === "section")
    query.eq("student_profiles.section", targets.section);
  if (scope === "coordinator") {
    query
      .eq(
        "internship_supervisors.supervisor_user_id",
        targets.coordinatorId,
      )
      .eq("internship_supervisors.supervisor_type", "coordinator")
      .is("internship_supervisors.deleted_at", null)
      .lte("internship_supervisors.started_at", now)
      .or(`ended_at.is.null,ended_at.gt.${now}`, {
        referencedTable: "internship_supervisors",
      });
  }
  return query;
}

import { isSupportedRoleCode } from './supported-roles.ts';

export type RoleAssignmentCandidate = {
  code: string;
  startsAt: string | null;
  endsAt: string | null;
  deletedAt: string | null;
};

export function requiresStudentProfile(roleCode: string | undefined): boolean {
  return roleCode === "student_intern";
}

export function activeRoleCodes(assignments: RoleAssignmentCandidate[], now = new Date()): string[] {
  const timestamp = now.getTime();
  return assignments
    .filter((assignment) => {
      const startsAt = assignment.startsAt ? Date.parse(assignment.startsAt) : Number.NEGATIVE_INFINITY;
      const endsAt = assignment.endsAt ? Date.parse(assignment.endsAt) : Number.POSITIVE_INFINITY;
      return isSupportedRoleCode(assignment.code) && !assignment.deletedAt && startsAt <= timestamp && endsAt > timestamp;
    })
    .map((assignment) => assignment.code);
}

export function resolveRoleCode(
  assignments: RoleAssignmentCandidate[],
  primaryRole: unknown,
  now = new Date(),
): string | undefined {
  const codes = activeRoleCodes(assignments, now);
  return typeof primaryRole === "string" && codes.includes(primaryRole)
    ? primaryRole
    : codes.find((code) => code !== "system_admin") ?? codes[0];
}

export type ActiveAssignmentCandidate = {
  id: string;
  academicTermId: string;
  startDate: string;
  expectedEndDate: string;
};

export type CurrentAcademicTerm = {
  id: string;
  startsOn: string;
  endsOn: string;
};

export function resolveActiveAssignmentId(
  assignments: ActiveAssignmentCandidate[],
  currentTerm: CurrentAcademicTerm | null,
  today: string,
): string | null {
  const dateValid = assignments.filter((assignment) => assignment.startDate <= today && assignment.expectedEndDate >= today);
  const currentTermAssignments = currentTerm
    ? dateValid.filter((assignment) => assignment.academicTermId === currentTerm.id)
    : [];
  const candidates = currentTermAssignments.length ? currentTermAssignments : dateValid;
  if (candidates.length > 1) {
    throw new Error("Multiple active internship assignments were found for your account. Please contact the internship coordinator.");
  }
  return candidates[0]?.id ?? null;
}

export type StudentIdentityInput = {
  studentNumber: string | null;
  yearLevel: number | null;
  section: string | null;
  expectedGraduationYear: number | null;
  academicProgramCode: string | null;
  academicProgramName: string | null;
  college: string | null;
  campus: string | null;
};

export function mapStudentIdentity(input: StudentIdentityInput) {
  return {
    studentNumber: input.studentNumber ?? undefined,
    yearLevel: input.yearLevel ?? undefined,
    section: input.section ?? undefined,
    expectedGraduationYear: input.expectedGraduationYear ?? undefined,
    academicProgram: input.academicProgramCode && input.academicProgramName
      ? `${input.academicProgramCode} — ${input.academicProgramName}`
      : undefined,
    college: input.college ?? undefined,
    campus: input.campus ?? undefined,
  };
}

export function formatStudentSidebarSubtitle(
  academicProgram: string | undefined,
  yearLevel: number | undefined,
  fallback: string,
): string {
  const programCode = academicProgram?.split(" — ", 1)[0]?.trim();
  const ordinalYear = yearLevel ? `${yearLevel}${yearLevel === 1 ? "st" : yearLevel === 2 ? "nd" : yearLevel === 3 ? "rd" : "th"} Year` : undefined;
  return [programCode, ordinalYear].filter(Boolean).join(" — ") || fallback;
}

export function formatCoordinatorSidebarSubtitle(
  college: string | undefined,
  programCode: string | undefined,
  fallback: string,
): string {
  if (!programCode) return fallback;
  return [college, `${programCode} Coordinator`].filter(Boolean).join(" · ");
}

import type { Intern } from "../types";

export type CoordinatorProgramStudent = {
  studentUserId: string;
  name: string;
  campus: string;
  program: string;
  programId?: string;
  yearLevel: number;
  section?: string;
  academicTerm?: string;
};

export function mergeCoordinatorProgramStudents(
  assignedInterns: Intern[],
  programStudents: CoordinatorProgramStudent[],
): Intern[] {
  const profileByStudentId = new Map(programStudents.map((student) => [student.studentUserId, student]));
  const assignedWithAcademicProfile = assignedInterns.map((intern) => {
    const profile = intern.studentUserId ? profileByStudentId.get(intern.studentUserId) : undefined;
    return profile ? { ...intern, yearLevel: profile.yearLevel, section: profile.section, academicTerm: profile.academicTerm } : intern;
  });
  const assignedStudentIds = new Set(
    assignedWithAcademicProfile
      .map((intern) => intern.studentUserId)
      .filter((studentUserId): studentUserId is string => Boolean(studentUserId)),
  );

  const awaitingAssignment = programStudents
    .filter((student) => !assignedStudentIds.has(student.studentUserId))
    .map((student): Intern => ({
      studentUserId: student.studentUserId,
      initials: student.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "SI",
      name: student.name,
      campus: student.campus,
      program: student.program,
      programId: student.programId,
      yearLevel: student.yearLevel,
      section: student.section,
      academicTerm: student.academicTerm,
      hte: "Not assigned",
      hteRepresentative: "Not assigned",
      hours: 0,
      requiredHours: 0,
      attendance: 0,
      requirements: "0/0",
      status: "Awaiting Assignment",
    }));

  return [...assignedWithAcademicProfile, ...awaitingAssignment].sort((left, right) => left.name.localeCompare(right.name));
}

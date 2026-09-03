import type { Intern } from "../types";

export type CoordinatorProgramStudent = {
  studentUserId: string;
  name: string;
  campus: string;
  program: string;
};

export function mergeCoordinatorProgramStudents(
  assignedInterns: Intern[],
  programStudents: CoordinatorProgramStudent[],
): Intern[] {
  const assignedStudentIds = new Set(
    assignedInterns
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
      hte: "Not assigned",
      hteRepresentative: "Not assigned",
      hours: 0,
      requiredHours: 0,
      attendance: 0,
      requirements: "0/0",
      status: "Awaiting Assignment",
    }));

  return [...assignedInterns, ...awaitingAssignment].sort((left, right) => left.name.localeCompare(right.name));
}

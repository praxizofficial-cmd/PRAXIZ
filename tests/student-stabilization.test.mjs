import assert from "node:assert/strict";
import test from "node:test";
import { activeRoleCodes, formatCoordinatorSidebarSubtitle, formatStudentSidebarSubtitle, mapStudentIdentity, requiresStudentProfile, resolveActiveAssignmentId, resolveRoleCode } from "../app/auth/student-stabilization.ts";

const now = new Date("2026-08-22T12:00:00Z");
const role = (code, startsAt = null, endsAt = null, deletedAt = null) => ({ code, startsAt, endsAt, deletedAt });

test("only student roles require a student profile", () => {
  assert.equal(requiresStudentProfile("student_intern"), true);
  for (const code of ["system_admin", "internship_coordinator", "hte_supervisor", undefined]) {
    assert.equal(requiresStudentProfile(code), false, code);
  }
});

test("role resolution ignores future, expired, and deleted assignments", () => {
  const assignments = [
    role("future_role", "2026-08-23T00:00:00Z"),
    role("expired_role", null, "2026-08-22T11:59:59Z"),
    role("deleted_role", null, null, "2026-08-21T00:00:00Z"),
    role("student_intern", "2026-08-01T00:00:00Z"),
  ];

  assert.deepEqual(activeRoleCodes(assignments, now), ["student_intern"]);
  assert.equal(resolveRoleCode(assignments, null, now), "student_intern");
});

test("valid primary_role remains preferred", () => {
  const assignments = [role("student_intern"), role("hte_supervisor")];
  assert.equal(resolveRoleCode(assignments, "hte_supervisor", now), "hte_supervisor");
  assert.equal(resolveRoleCode(assignments, "future_role", now), "student_intern");
});

const assignment = (id, academicTermId, startDate, expectedEndDate) => ({ id, academicTermId, startDate, expectedEndDate });
const currentTerm = { id: "term-current", startsOn: "2026-08-17", endsOn: "2026-12-19" };

test("assignment resolution returns no assignment when none is valid", () => {
  assert.equal(resolveActiveAssignmentId([], currentTerm, "2026-08-22"), null);
  assert.equal(resolveActiveAssignmentId([assignment("inactive", "term-current", "2026-08-01", "2026-08-21")], currentTerm, "2026-08-22"), null);
  assert.equal(resolveActiveAssignmentId([assignment("future", "term-current", "2026-08-23", "2026-09-01")], currentTerm, "2026-08-22"), null);
});

test("assignment resolution selects the one date-valid active assignment", () => {
  assert.equal(resolveActiveAssignmentId([assignment("active", "term-current", "2026-08-17", "2026-12-19")], currentTerm, "2026-08-22"), "active");
});

test("assignment resolution prefers the current academic term", () => {
  const assignments = [
    assignment("older", "term-old", "2026-01-01", "2026-12-31"),
    assignment("current", "term-current", "2026-08-17", "2026-12-19"),
  ];
  assert.equal(resolveActiveAssignmentId(assignments, currentTerm, "2026-08-22"), "current");
});

test("assignment resolution rejects multiple valid candidates instead of choosing an arbitrary row", () => {
  assert.throws(
    () => resolveActiveAssignmentId([
      assignment("first", "term-current", "2026-08-17", "2026-12-19"),
      assignment("second", "term-current", "2026-08-18", "2026-12-19"),
    ], currentTerm, "2026-08-22"),
    /Multiple active internship assignments/,
  );
});

test("student identity maps authoritative profile and organization fields", () => {
  assert.deepEqual(mapStudentIdentity({
    studentNumber: "2026-00123",
    yearLevel: 4,
    section: "A",
    expectedGraduationYear: 2027,
    academicProgramCode: "BSIT",
    academicProgramName: "Bachelor of Science in Information Technology",
    college: "CECS",
    campus: "Main Campus",
  }), {
    studentNumber: "2026-00123",
    yearLevel: 4,
    section: "A",
    expectedGraduationYear: 2027,
    academicProgram: "BSIT — Bachelor of Science in Information Technology",
    college: "CECS",
    campus: "Main Campus",
  });
});

test("student identity leaves unsupported values unavailable", () => {
  const identity = mapStudentIdentity({
    studentNumber: null,
    yearLevel: null,
    section: null,
    expectedGraduationYear: null,
    academicProgramCode: null,
    academicProgramName: null,
    college: null,
    campus: null,
  });
  assert.deepEqual(Object.values(identity), Array(7).fill(undefined));
});

test("student sidebar subtitle uses the authenticated program and year level", () => {
  assert.equal(
    formatStudentSidebarSubtitle("BSIT — Bachelor of Science in Information Technology", 4, "BSIT — 3rd Year"),
    "BSIT — 4th Year",
  );
  assert.equal(formatStudentSidebarSubtitle(undefined, undefined, "Student Intern"), "Student Intern");
});

test("coordinator sidebar subtitle uses the authenticated program scope", () => {
  assert.equal(formatCoordinatorSidebarSubtitle("CECS", "BAT", "Program Coordinator"), "CECS · BAT Coordinator");
  assert.equal(formatCoordinatorSidebarSubtitle(undefined, "BAT", "Program Coordinator"), "BAT Coordinator");
  assert.equal(formatCoordinatorSidebarSubtitle("CECS", undefined, "Program Coordinator"), "Program Coordinator");
});

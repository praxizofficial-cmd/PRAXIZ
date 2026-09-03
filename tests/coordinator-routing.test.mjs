import test from "node:test";
import assert from "node:assert/strict";
import { mergeCoordinatorProgramStudents } from "../app/services/coordinator-routing.ts";

test("program students without placements remain visible to their coordinator", () => {
  const assigned = [{
    studentUserId: "ashley",
    initials: "AM",
    name: "Ashley Mañago",
    campus: "Goa Main Campus",
    program: "BSIT",
    hte: "Assigned HTE",
    hteRepresentative: "Representative",
    hours: 0,
    requiredHours: 400,
    attendance: 0,
    requirements: "0/0",
    status: "Needs Attention",
  }];
  const students = [
    { studentUserId: "elyssa", name: "Elyssa Vasquez", campus: "Goa Main Campus", program: "BSIT" },
    { studentUserId: "ashley", name: "Ashley Mañago", campus: "Goa Main Campus", program: "BSIT" },
  ];

  assert.deepEqual(mergeCoordinatorProgramStudents(assigned, students).map((student) => ({
    id: student.studentUserId,
    status: student.status,
    hte: student.hte,
  })), [
    { id: "ashley", status: "Needs Attention", hte: "Assigned HTE" },
    { id: "elyssa", status: "Awaiting Assignment", hte: "Not assigned" },
  ]);
});

test("students already represented by an assignment are not duplicated", () => {
  const assigned = [{
    studentUserId: "student-1",
    initials: "AS",
    name: "Assigned Student",
    campus: "Main Campus",
    program: "BSIT",
    hte: "HTE",
    hteRepresentative: "Representative",
    hours: 20,
    requiredHours: 400,
    attendance: 100,
    requirements: "1/1",
    status: "Active",
  }];

  const result = mergeCoordinatorProgramStudents(assigned, [
    { studentUserId: "student-1", name: "Assigned Student", campus: "Main Campus", program: "BSIT" },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].status, "Active");
});

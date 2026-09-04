export const roleIds = ["student", "hte", "coordinator", "admin"] as const;

export type RoleId = (typeof roleIds)[number];

export type Permission =
  | "attendance:view"
  | "attendance:record"
  | "attendance:verify"
  | "daily-logs:submit"
  | "daily-logs:review"
  | "documents:upload"
  | "documents:review"
  | "evaluations:view"
  | "evaluations:score"
  | "evaluations:finalize"
  | "hte-offerings:manage"
  | "internships:manage"
  | "reports:generate"
  | "users:manage"
  | "master-data:manage"
  | "audit:view";

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  permission?: Permission;
};

export type Campus = {
  id: string;
  name: string;
  shortName: string;
  municipality?: string;
};

export type College = {
  id: string;
  campusId: string;
  name: string;
  shortName: string;
};

export type Program = {
  id: string;
  collegeId: string;
  code: string;
  name: string;
};

export type AcademicTerm = {
  id: string;
  academicYear: string;
  term: "First Semester" | "Second Semester" | "Midyear";
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  studentNumber?: string;
  yearLevel?: number;
  section?: string;
  expectedGraduationYear?: number;
  academicProgram?: string;
  campus?: string;
  college?: string;
  scopeProgramId?: string;
  scopeProgramCode?: string;
  scopeProgramName?: string;
  scopeOrgUnitId?: string;
  role: RoleId;
  roles: RoleId[];
  accountStatus: "active" | "pending_verification";
};

export type InternshipStatus =
  | "Pending"
  | "Approved"
  | "Active"
  | "Completed"
  | "Cancelled"
  | "Suspended";

export type InternshipAssignment = {
  id: string;
  studentId: string;
  academicTermId: string;
  campusId: string;
  programId: string;
  hteId: string;
  coordinatorId: string;
  requiredHours: number;
  startDate: string;
  expectedEndDate: string;
  status: InternshipStatus;
};

export type AttendanceStatus =
  | "Active"
  | "Pending Verification"
  | "Verified"
  | "Flagged"
  | "Rejected"
  | "Voided";

export type AttendanceEvent = {
  id: string;
  sessionId: string;
  kind: "time_in" | "time_out";
  occurredAt: string;
  timestampSource: "server";
};

export type AttendanceSession = {
  id: string;
  internshipAssignmentId: string;
  timeIn: AttendanceEvent;
  timeOut: AttendanceEvent | null;
  status: AttendanceStatus;
};

export type Intern = {
  studentUserId?: string;
  initials: string;
  name: string;
  campus: string;
  program: string;
  hte: string;
  hteRepresentative: string;
  hours: number;
  requiredHours?: number;
  attendance: number;
  requirements: string;
  status: "Active" | "Completed" | "Needs Attention" | "Awaiting Assignment";
};

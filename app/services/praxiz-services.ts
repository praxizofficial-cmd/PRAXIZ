import { createClient } from "../../lib/supabase/client";
import { getSiteOrigin } from "../../lib/site-url";
import { resolveActiveAssignmentId } from "../auth/student-stabilization";
import { buildSaveDailyLogRpcArgs, type DailyLogAssignment } from "./daily-log-stabilization";
import { programsForCollege } from "./institutional-stabilization";
import { normalizeDocumentTemplateCode, validateDocumentTemplate, type DocumentTemplatePhase } from "./workflow-template-stabilization";
import { mergeCoordinatorProgramStudents, type CoordinatorProgramStudent } from "./coordinator-routing";
import {
  normalizeEvaluationCode,
  validateEvaluationTemplate,
  type EvaluationTemplateCriterionInput,
  type EvaluationTemplateEvaluator,
  type EvaluationTemplateStage,
} from "./evaluation-template-stabilization";
import type { AcademicTerm, AttendanceEvent, AttendanceSession, AttendanceStatus, Campus, College, Intern, Program } from "../types";

type AttendanceEventRow = {
  id: string;
  event_type: "time_in" | "time_out";
  occurred_at: string;
  source: "web" | "mobile" | "kiosk";
};

type AttendanceSessionRow = {
  id: string;
  internship_assignment_id: string;
  work_date: string;
  status: "open" | "pending_verification" | "verified" | "flagged" | "rejected" | "voided";
  attendance_events?: AttendanceEventRow[] | null;
  attendance_verifications?: Array<{
    reviewer_user_id: string;
    decision: "verified" | "flagged" | "rejected";
    verified_minutes: number | null;
    remarks: string | null;
    created_at: string;
  }> | null;
  internship_assignments?: { student_user_id?: string } | Array<{ student_user_id?: string }> | null;
};

export type AttendanceHistoryRow = {
  id: string;
  studentName: string;
  date: string;
  day: string;
  timeIn: string;
  timeOut: string;
  hours: string;
  status: AttendanceStatus;
  verifiedBy: string;
  remarks: string;
};

export type DocumentRecord = {
  id: string;
  assignmentId: string;
  studentName: string;
  templateName: string;
  phase: "Pre-Internship" | "During Internship" | "Post-Internship";
  status: string;
  dueAt: string;
  fileId: string | null;
  submissionId: string | null;
  fileName: string;
  objectPath: string | null;
  mimeType: string | null;
  latestFeedback: string;
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
};

export type DocumentTemplateRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  phase: DocumentTemplatePhase;
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
  isRequired: boolean;
  isActive: boolean;
  displayOrder: number;
};

export type CreateDocumentTemplateInput = {
  code: string;
  name: string;
  description: string;
  phase: DocumentTemplatePhase;
  allowedMimeTypes: string[];
  maxFileSizeMb: number;
  isRequired: boolean;
  isActive: boolean;
  displayOrder: number;
};

export type EvaluationTemplateRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  stage: EvaluationTemplateStage;
  evaluatorType: EvaluationTemplateEvaluator | "faculty";
  version: number;
  isActive: boolean;
  criteria: EvaluationTemplateCriterionInput[];
};

export type CreateEvaluationTemplateInput = {
  code: string;
  name: string;
  description: string;
  stage: EvaluationTemplateStage;
  evaluatorType: EvaluationTemplateEvaluator;
  isActive: boolean;
  criteria: EvaluationTemplateCriterionInput[];
};

export type DailyLogRecord = {
  id: string;
  assignmentId: string;
  studentName: string;
  logDate: string;
  date: string;
  week: string;
  hours: number;
  summary: string;
  learnings: string;
  challenges: string;
  submitted: string;
  status: string;
  latestFeedback: string;
};

export type DailyLogInput = {
  id?: string;
  logDate: string;
  hours: number;
  activities: string;
  learnings?: string;
  challenges?: string;
};

export type RegistrationRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  reference: string;
  submitted: string;
  status: string;
  details: Record<string, string>;
};

export type EvaluationCriterionRecord = {
  id: string;
  label: string;
  description: string;
  minimumScore: number;
  maximumScore: number;
  weight: number;
  score: number;
};

export type EvaluationRecord = {
  id: string;
  assignmentId: string;
  templateId: string;
  templateName: string;
  studentName: string;
  evaluatorName: string;
  status: "Draft" | "Submitted" | "Finalized" | "Returned";
  strengths: string;
  areasForImprovement: string;
  overallRemarks: string;
  reviewFeedback: string;
  reviewedAt: string;
  weightedScore: number | null;
  submittedAt: string;
  criteria: EvaluationCriterionRecord[];
};

export type EvaluationAssignment = { id: string; studentName: string };

export type EvaluationInput = {
  id?: string;
  assignmentId: string;
  templateId: string;
  strengths: string;
  areasForImprovement: string;
  overallRemarks: string;
  criteria: Array<{ id: string; score: number }>;
  submit: boolean;
};

export type NotificationRecord = {
  id: string;
  title: string;
  message: string;
  tone: "info" | "success" | "warning" | "error";
  time: string;
  unread: boolean;
};

export type PartnerHteRecord = {
  id: string;
  name: string;
  representative: string;
  assignedInterns: number;
  status: string;
  industry: string;
  location: string;
};

export type AssignmentOption = { id: string; label: string };
export type AssignmentOptions = {
  students: AssignmentOption[];
  htes: AssignmentOption[];
  terms: Array<AssignmentOption & { startsOn: string; endsOn: string }>;
};

export type CreateAssignmentInput = {
  studentUserId: string;
  hteId: string;
  academicTermId: string;
  requiredHours: number;
  startDate: string;
  expectedEndDate: string;
  submitForApproval: boolean;
};

export type RolePolicyRecord = {
  id: string;
  name: string;
  description: string;
  scope: string;
  accounts: number;
  active: boolean;
  permissions: Array<{ code: string; description: string }>;
};

export type AuditLogRecord = {
  id: string;
  action: string;
  actor: string;
  entity: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

export type FeedbackRecord = {
  id: string;
  assignmentId: string;
  studentName: string;
  subject: string;
  message: string;
  authorName: string;
  createdAt: string;
  status: "Open" | "In Progress" | "Resolved";
};

export type StudentProgressSummary = {
  assignmentId: string;
  status: string;
  renderedHours: number;
  requiredHours: number;
  attendanceRate: number;
  recordedSessions: number;
  verifiedSessions: number;
  logsSubmitted: number;
  logsApproved: number;
  logsExpected: number;
  documentsApproved: number;
  documentsRequired: number;
  evaluationAverage: number | null;
  campus: string;
  program: string;
  hte: string;
  coordinator: string;
  startDate: string;
  endDate: string;
  requirements: Array<{ name: string; status: string; complete: boolean }>;
};

export type AdminSummary = {
  activeAccounts: number;
  pendingRegistrations: number;
  roleAssignments: number;
  securityEvents: number;
};

export type UserAccountRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  reference: string;
  status: string;
};

type InstitutionalUnitRow = { id: string; parent_id: string | null; unit_type: string; code: string; name: string; short_name: string | null; is_active: boolean; deleted_at: string | null };
type InstitutionalProgramRow = { id: string; owning_org_unit_id: string; code: string; name: string; is_active: boolean; deleted_at: string | null };

export type AcademicYearRecord = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
};

export type CreateCampusInput = { code: string; name: string; shortName: string; municipality: string };
export type CreateCollegeInput = { campusId: string; code: string; name: string; shortName: string };
export type CreateProgramInput = { collegeId: string; code: string; name: string };
export type CreateAcademicTermInput = {
  academicYearId: string;
  term: "first_semester" | "second_semester" | "midyear";
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
};

async function activeInstitutionalUnits(): Promise<InstitutionalUnitRow[]> {
  const { data, error } = await createClient()
    .from("org_units")
    .select("id,parent_id,unit_type,code,name,short_name,is_active,deleted_at")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as InstitutionalUnitRow[];
}

async function registrationInstitutionalUnits(): Promise<InstitutionalUnitRow[]> {
  const { data, error } = await createClient()
    .from("org_units")
    .select("id,parent_id,unit_type,code,name,short_name,is_active,deleted_at")
    .in("unit_type", ["campus", "college", "department"])
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");
  if (error) {
    console.error("Registration org_units lookup failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error(error.message);
  }
  return (data ?? []) as InstitutionalUnitRow[];
}

async function registrationPrograms(): Promise<InstitutionalProgramRow[]> {
  const { data, error } = await createClient()
    .from("academic_programs")
    .select("id,owning_org_unit_id,code,name,is_active,deleted_at")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("code");
  if (error) {
    console.error("Registration academic_programs lookup failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error(error.message);
  }
  return (data ?? []) as InstitutionalProgramRow[];
}

export const institutionalService = {
  async listActiveCampuses(): Promise<Campus[]> {
    const [{ data: campusRows, error: campusError }, rows] = await Promise.all([
      createClient().from("campuses").select("org_unit_id,municipality"),
      activeInstitutionalUnits(),
    ]);
    if (campusError) {
      console.error("Institutional campuses lookup failed", { code: campusError.code, message: campusError.message, details: campusError.details, hint: campusError.hint });
      throw new Error(campusError.message);
    }
    const typedCampusRows = (campusRows ?? []) as Array<{ org_unit_id: string; municipality: string | null }>;
    const campusLocations = new Map<string, string | undefined>(typedCampusRows.map((row) => [row.org_unit_id, row.municipality ?? undefined]));
    return rows.filter((row) => row.unit_type === "campus" && campusLocations.has(row.id)).map((row) => ({ id: row.id, name: row.name, shortName: row.short_name ?? row.name, municipality: campusLocations.get(row.id) }));
  },
  async listActiveColleges(): Promise<College[]> {
    const rows = await activeInstitutionalUnits();
    return rows.filter((row) => row.unit_type === "college").map((row) => ({ id: row.id, campusId: row.parent_id ?? "", name: row.name, shortName: row.short_name ?? row.name }));
  },
  async listCollegesForCampus(campusId: string): Promise<College[]> {
    const rows = await activeInstitutionalUnits();
    return rows.filter((row) => row.parent_id === campusId && row.unit_type === "college").map((row) => ({ id: row.id, campusId, name: row.name, shortName: row.short_name ?? row.name }));
  },
  async listActivePrograms(): Promise<Program[]> {
    const { data, error } = await createClient().from("academic_programs").select("id,owning_org_unit_id,code,name,is_active,deleted_at").eq("is_active", true).is("deleted_at", null).order("code");
    if (error) throw new Error(error.message);
    return ((data ?? []) as InstitutionalProgramRow[]).map((row) => ({ id: row.id, collegeId: row.owning_org_unit_id, code: row.code, name: row.name }));
  },
  async listProgramsForUnit(unitId: string): Promise<Program[]> {
    const [units, programs] = await Promise.all([activeInstitutionalUnits(), this.listActivePrograms()]);
    return programsForCollege(units.map((row) => ({ id: row.id, parentId: row.parent_id, unitType: row.unit_type, code: row.code, name: row.name, shortName: row.short_name })), programs.map((program) => ({ ...program, owningOrgUnitId: program.collegeId, isActive: true })), unitId).map((program) => ({ id: program.id, collegeId: program.owningOrgUnitId, code: program.code, name: program.name }));
  },
  async loadRegistrationInstitutionalOptions() {
    const [{ units, programs }, campusResult] = await Promise.all([
      Promise.all([registrationInstitutionalUnits(), registrationPrograms()]).then(([unitRows, programRows]) => ({ units: unitRows, programs: programRows })),
      createClient().from("campuses").select("org_unit_id,municipality"),
    ]);
    if (campusResult.error) {
      const error = campusResult.error;
      console.error("Registration campuses lookup failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
      throw new Error(error.message);
    }
    const unitModels = units.map((row) => ({ id: row.id, parentId: row.parent_id, unitType: row.unit_type, code: row.code, name: row.name, shortName: row.short_name }));
    const programModels = programs.map((row) => ({ id: row.id, owningOrgUnitId: row.owning_org_unit_id, code: row.code, name: row.name, isActive: row.is_active }));
    const campusIds = new Set(units.filter((row) => row.unit_type === "campus").map((row) => row.id));
    return {
      campuses: ((campusResult.data ?? []) as Array<{ org_unit_id: string; municipality: string | null }>)
        .filter((row) => campusIds.has(row.org_unit_id as string))
        .map((row) => {
          const unit = units.find((item) => item.id === row.org_unit_id);
          return { id: row.org_unit_id as string, name: unit?.name ?? "", shortName: unit?.short_name ?? unit?.name ?? "", municipality: row.municipality as string };
        }),
      units: unitModels,
      programs: programModels,
    };
  },
  async listAcademicTerms(): Promise<AcademicTerm[]> {
    const { data, error } = await createClient().from("academic_terms").select("id,academic_year_id,term,starts_on,ends_on,is_current,academic_years(label)").is("deleted_at", null).order("starts_on", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; term: string; starts_on: string; ends_on: string; is_current: boolean; academic_years?: { label: string } | Array<{ label: string }> | null }>).map((row) => {
      const year = Array.isArray(row.academic_years) ? row.academic_years[0] : row.academic_years;
      const term = row.term === "first_semester" ? "First Semester" : row.term === "second_semester" ? "Second Semester" : "Midyear";
      return { id: row.id, academicYear: year?.label ?? "", term, startsOn: row.starts_on, endsOn: row.ends_on, isCurrent: row.is_current };
    });
  },
  async getCurrentAcademicTerm(): Promise<AcademicTerm | null> {
    const terms = await this.listAcademicTerms();
    return terms.find((term) => term.isCurrent) ?? null;
  },
  async listAcademicYears(): Promise<AcademicYearRecord[]> {
    const { data, error } = await createClient()
      .from("academic_years")
      .select("id,label,starts_on,ends_on,is_current")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; label: string; starts_on: string; ends_on: string; is_current: boolean }>).map((row) => ({
      id: row.id,
      label: row.label,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      isCurrent: row.is_current,
    }));
  },
  async createCampus(input: CreateCampusInput): Promise<Campus> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_campus", {
      p_code: input.code.trim(),
      p_name: input.name.trim(),
      p_short_name: input.shortName.trim(),
      p_municipality: input.municipality.trim(),
    });
    if (error || !data) throw new Error(error?.message ?? "The campus could not be created.");
    return { id: data as string, name: input.name.trim(), shortName: input.shortName.trim(), municipality: input.municipality.trim() };
  },
  async createCollege(input: CreateCollegeInput): Promise<College> {
    const { data, error } = await createClient()
      .from("org_units")
      .insert({
        parent_id: input.campusId,
        unit_type: "college",
        code: input.code.trim(),
        name: input.name.trim(),
        short_name: input.shortName.trim(),
      })
      .select("id,parent_id,name,short_name")
      .single();
    if (error || !data) throw new Error(error?.message ?? "The college could not be created.");
    return { id: data.id as string, campusId: data.parent_id as string, name: data.name as string, shortName: (data.short_name as string | null) ?? (data.name as string) };
  },
  async createProgram(input: CreateProgramInput): Promise<Program> {
    const supabase = createClient();
    const code = input.code.trim();
    const { data: existing, error: lookupError } = await supabase
      .from("academic_programs")
      .select("id,name")
      .eq("owning_org_unit_id", input.collegeId)
      .ilike("code", code)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (existing) {
      throw new Error(`${code} already exists in the selected college as ${existing.name}. Use the existing program or enter a different code.`);
    }

    const { data, error } = await supabase
      .from("academic_programs")
      .insert({ owning_org_unit_id: input.collegeId, code, name: input.name.trim() })
      .select("id,owning_org_unit_id,code,name")
      .single();
    if (error || !data) {
      if (error?.code === "23505") throw new Error(`${code} already exists in the selected college. Use the existing program or enter a different code.`);
      throw new Error(error?.message ?? "The program could not be created.");
    }
    return { id: data.id as string, collegeId: data.owning_org_unit_id as string, code: data.code as string, name: data.name as string };
  },
  async createAcademicTerm(input: CreateAcademicTermInput): Promise<void> {
    const { error } = await createClient().rpc("create_academic_term", {
      p_academic_year_id: input.academicYearId,
      p_term: input.term,
      p_starts_on: input.startsOn,
      p_ends_on: input.endsOn,
      p_is_current: input.isCurrent,
    });
    if (error) throw new Error(error.message);
  },
};

function attendanceStatus(status: AttendanceSessionRow["status"]): AttendanceStatus {
  const statuses: Record<AttendanceSessionRow["status"], AttendanceStatus> = {
    open: "Active",
    pending_verification: "Pending Verification",
    verified: "Verified",
    flagged: "Flagged",
    rejected: "Rejected",
    voided: "Voided",
  };
  return statuses[status];
}

function mapEvent(row: AttendanceEventRow, sessionId: string): AttendanceEvent {
  return {
    id: row.id,
    sessionId,
    kind: row.event_type,
    occurredAt: row.occurred_at,
    timestampSource: "server",
  };
}

function mapSession(row: AttendanceSessionRow): AttendanceSession {
  const events = row.attendance_events ?? [];
  const timeIn = events.find((event) => event.event_type === "time_in");
  if (!timeIn) throw new Error("The attendance session has no Time In event.");
  const timeOut = events.find((event) => event.event_type === "time_out");
  return {
    id: row.id,
    internshipAssignmentId: row.internship_assignment_id,
    timeIn: mapEvent(timeIn, row.id),
    timeOut: timeOut ? mapEvent(timeOut, row.id) : null,
    status: attendanceStatus(row.status),
  };
}

function formatClock(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function manilaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

async function currentUserId() {
  const { data, error } = await createClient().auth.getUser();
  if (error || !data.user) throw new Error("Sign in before recording attendance.");
  return data.user.id;
}

async function activeStudentAssignmentId() {
  const assignment = await activeStudentAssignment();
  if (!assignment) throw new Error("No active internship assignment is available for your account.");
  return assignment.id;
}

async function activeStudentAssignment(): Promise<DailyLogAssignment | null> {
  const userId = await currentUserId();
  const { data: currentTerm, error: termError } = await createClient()
    .from("academic_terms")
    .select("id,starts_on,ends_on")
    .eq("is_current", true)
    .is("deleted_at", null)
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (termError) throw new Error(termError.message);

  const { data, error } = await createClient()
    .from("internship_assignments")
    .select("id,academic_term_id,start_date,expected_end_date")
    .eq("student_user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("start_date", { ascending: false })
    .order("expected_end_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Array<{ id: string; academic_term_id: string; start_date: string; expected_end_date: string }>).map((row) => ({
      id: row.id,
      academicTermId: row.academic_term_id,
      startDate: row.start_date,
      expectedEndDate: row.expected_end_date,
    }));
  const currentTermRow = currentTerm as { id: string; starts_on: string; ends_on: string } | null;
  const assignmentId = resolveActiveAssignmentId(
    rows,
    currentTermRow ? { id: currentTermRow.id, startsOn: currentTermRow.starts_on, endsOn: currentTermRow.ends_on } : null,
    manilaDate(),
  );
  const assignment = rows.find((row) => row.id === assignmentId);
  return assignment ? { id: assignment.id, startDate: assignment.startDate, endDate: assignment.expectedEndDate } : null;
}

const sessionSelection = "id,internship_assignment_id,work_date,status,internship_assignments(student_user_id),attendance_events(id,event_type,occurred_at,source),attendance_verifications(reviewer_user_id,decision,verified_minutes,remarks,created_at)";

async function readSession(sessionId: string) {
  const { data, error } = await createClient()
    .from("attendance_sessions")
    .select(sessionSelection)
    .eq("id", sessionId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Attendance session could not be loaded.");
  return mapSession(data as unknown as AttendanceSessionRow);
}

const assignmentSelection = "id,student_user_id,required_hours,status,start_date,expected_end_date,academic_programs(code,name),hte_organizations(name,trade_name),org_units(name,short_name),internship_supervisors(supervisor_user_id,supervisor_type,is_primary,ended_at,deleted_at)";

function joinedOne<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export const internshipService = {
  async listLiveInterns(): Promise<Intern[]> {
    const supabase = createClient();
    const [{ data: assignments, error: assignmentError }, { data: progress, error: progressError }] = await Promise.all([
      supabase.from("internship_assignments").select(assignmentSelection).is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("assignment_progress").select("internship_assignment_id,rendered_hours,attendance_verification_percent,required_documents,satisfied_documents,has_open_issues"),
    ]);
    if (assignmentError) throw new Error(assignmentError.message);
    if (progressError) throw new Error(progressError.message);

    type AssignmentRow = {
      id: string;
      student_user_id: string;
      required_hours: number;
      status: string;
      academic_programs?: { code: string; name: string } | Array<{ code: string; name: string }> | null;
      hte_organizations?: { name: string; trade_name: string | null } | Array<{ name: string; trade_name: string | null }> | null;
      org_units?: { name: string; short_name: string | null } | Array<{ name: string; short_name: string | null }> | null;
      internship_supervisors?: Array<{ supervisor_user_id: string; supervisor_type: string; is_primary: boolean; ended_at: string | null; deleted_at: string | null }> | null;
    };
    type ProgressRow = { internship_assignment_id: string; rendered_hours: number | string; attendance_verification_percent: number | string; required_documents: number; satisfied_documents: number; has_open_issues: boolean };
    const rows = (assignments ?? []) as unknown as AssignmentRow[];
    const activeSupervisors = (row: AssignmentRow) => (row.internship_supervisors ?? []).filter((supervisor) => !supervisor.ended_at && !supervisor.deleted_at);
    const supervisorIds = rows.flatMap(activeSupervisors).map((supervisor) => supervisor.supervisor_user_id);
    const names = await namesForUsers([...rows.map((row) => row.student_user_id), ...supervisorIds]);
    const progressByAssignment = new Map(((progress ?? []) as ProgressRow[]).map((row) => [row.internship_assignment_id, row]));

    return rows.map((row) => {
      const program = joinedOne(row.academic_programs);
      const hte = joinedOne(row.hte_organizations);
      const campus = joinedOne(row.org_units);
      const summary = progressByAssignment.get(row.id);
      const attendanceRate = Math.round(Number(summary?.attendance_verification_percent ?? 0));
      const supervisors = activeSupervisors(row);
      const hteRepresentative = [...supervisors]
        .sort((left, right) => Number(right.is_primary) - Number(left.is_primary))
        .find((item) => item.supervisor_type === "hte");
      const requiredDocuments = Number(summary?.required_documents ?? 0);
      const satisfiedDocuments = Number(summary?.satisfied_documents ?? 0);
      const rawStatus = row.status === "completed" ? "Completed" : row.status === "active" ? "Active" : "Needs Attention";
      const status = rawStatus === "Active" && (summary?.has_open_issues || (attendanceRate > 0 && attendanceRate < 80)) ? "Needs Attention" : rawStatus;
      const name = names.get(row.student_user_id) ?? "Assigned intern";
      const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SI";
      return {
        studentUserId: row.student_user_id,
        initials,
        name,
        campus: campus?.short_name ?? campus?.name ?? "Assigned campus",
        program: program?.code ?? "—",
        hte: hte?.trade_name ?? hte?.name ?? "Assigned HTE",
        hteRepresentative: hteRepresentative ? names.get(hteRepresentative.supervisor_user_id) ?? "Assigned HTE representative" : "Not assigned",
        hours: Math.round(Number(summary?.rendered_hours ?? 0)),
        requiredHours: row.required_hours,
        attendance: attendanceRate,
        requirements: `${satisfiedDocuments}/${requiredDocuments}`,
        status,
      } as Intern & { requiredHours: number };
    });
  },
  async listCoordinatorInterns(): Promise<Intern[]> {
    const supabase = createClient();
    const [assignedInterns, { data, error }] = await Promise.all([
      internshipService.listLiveInterns(),
      supabase.rpc("list_coordinator_program_students"),
    ]);
    if (error) throw new Error(error.message);

    type ProgramStudentRow = {
      student_user_id: string;
      full_name: string;
      campus_name: string;
      program_code: string;
    };
    const programStudents = ((data ?? []) as ProgramStudentRow[]).map((row): CoordinatorProgramStudent => ({
      studentUserId: row.student_user_id,
      name: row.full_name,
      campus: row.campus_name,
      program: row.program_code,
    }));

    return mergeCoordinatorProgramStudents(assignedInterns, programStudents);
  },
  async getStudentProgress(): Promise<StudentProgressSummary | null> {
    const supabase = createClient();
    const resolvedAssignment = await activeStudentAssignment();
    if (!resolvedAssignment) return null;
    const assignmentId = resolvedAssignment.id;
    const { data: assignment, error: assignmentError } = await supabase
      .from("internship_assignments")
      .select(assignmentSelection)
      .eq("id", assignmentId)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();
    if (assignmentError) throw new Error(assignmentError.message);
    if (!assignment) return null;

    type AssignmentRow = {
      id: string;
      required_hours: number;
      status: string;
      start_date: string;
      expected_end_date: string;
      academic_programs?: { code: string; name: string } | Array<{ code: string; name: string }> | null;
      hte_organizations?: { name: string; trade_name: string | null } | Array<{ name: string; trade_name: string | null }> | null;
      org_units?: { name: string; short_name: string | null } | Array<{ name: string; short_name: string | null }> | null;
      internship_supervisors?: Array<{ supervisor_user_id: string; supervisor_type: string; is_primary: boolean; ended_at: string | null; deleted_at: string | null }> | null;
    };
    const row = assignment as unknown as AssignmentRow;
    const [{ data: progress, error: progressError }, { data: requirements, error: requirementError }] = await Promise.all([
      supabase.from("assignment_progress").select("rendered_hours,total_sessions,verified_sessions,attendance_verification_percent,total_log_days,submitted_logs,approved_logs,required_documents,satisfied_documents,average_score").eq("internship_assignment_id", row.id).maybeSingle(),
      supabase.from("document_requirements").select("status,document_requirement_templates(name,display_order)").eq("internship_assignment_id", row.id).order("created_at", { ascending: true }),
    ]);
    if (progressError) throw new Error(progressError.message);
    if (requirementError) throw new Error(requirementError.message);

    const supervisors = (row.internship_supervisors ?? []).filter((supervisor) => !supervisor.ended_at && !supervisor.deleted_at);
    const names = await namesForUsers(supervisors.map((supervisor) => supervisor.supervisor_user_id));
    const findSupervisor = (type: string) => supervisors.find((item) => item.supervisor_type === type && item.is_primary) ?? supervisors.find((item) => item.supervisor_type === type);
    type RequirementRow = { status: string; document_requirement_templates?: { name: string; display_order: number } | Array<{ name: string; display_order: number }> | null };
    const requirementItems = ((requirements ?? []) as unknown as RequirementRow[]).map((requirement) => {
      const template = joinedOne(requirement.document_requirement_templates);
      return {
        name: template?.name ?? "Internship requirement",
        status: documentStatus[requirement.status] ?? requirement.status,
        complete: requirement.status === "approved" || requirement.status === "waived",
        displayOrder: template?.display_order ?? 0,
      };
    }).sort((left, right) => left.displayOrder - right.displayOrder);
    const program = joinedOne(row.academic_programs);
    const hte = joinedOne(row.hte_organizations);
    const campus = joinedOne(row.org_units);
    let hteDisplayName = hte?.trade_name ?? hte?.name ?? "";
    if (!hteDisplayName) {
      const { data: assignedHteName, error: assignedHteError } = await supabase.rpc("get_assignment_hte_name", {
        p_assignment_id: row.id,
      });
      if (!assignedHteError && typeof assignedHteName === "string") hteDisplayName = assignedHteName.trim();
    }
    const progressRow = progress as null | { rendered_hours: number | string; total_sessions: number; verified_sessions: number; attendance_verification_percent: number | string; total_log_days: number; submitted_logs: number; approved_logs: number; required_documents: number; satisfied_documents: number; average_score: number | string | null };
    const logsSubmitted = Number(progressRow?.submitted_logs ?? 0);
    return {
      assignmentId: row.id,
      status: row.status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      renderedHours: Number(progressRow?.rendered_hours ?? 0),
      requiredHours: row.required_hours,
      attendanceRate: Math.round(Number(progressRow?.attendance_verification_percent ?? 0)),
      recordedSessions: Number(progressRow?.total_sessions ?? 0),
      verifiedSessions: Number(progressRow?.verified_sessions ?? 0),
      logsSubmitted,
      logsApproved: Number(progressRow?.approved_logs ?? 0),
      logsExpected: Number(progressRow?.total_log_days ?? 0),
      documentsApproved: Number(progressRow?.satisfied_documents ?? 0),
      documentsRequired: Number(progressRow?.required_documents ?? 0),
      evaluationAverage: progressRow?.average_score == null ? null : Number(progressRow.average_score),
      campus: campus?.short_name ?? campus?.name ?? "Assigned campus",
      program: program ? `${program.code} — ${program.name}` : "Assigned program",
      hte: hteDisplayName || "Assigned HTE",
      coordinator: (() => { const person = findSupervisor("coordinator"); return person ? names.get(person.supervisor_user_id) ?? "Assigned coordinator" : "Not assigned"; })(),
      startDate: displayDate(row.start_date),
      endDate: displayDate(row.expected_end_date),
      requirements: requirementItems.map((requirement) => ({ name: requirement.name, status: requirement.status, complete: requirement.complete })),
    };
  },
};

export const attendanceService = {
  listHistory: (): AttendanceHistoryRow[] => [],
  async listLiveHistory(): Promise<AttendanceHistoryRow[]> {
    const { data, error } = await createClient()
      .from("attendance_sessions")
      .select(sessionSelection)
      .order("work_date", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as AttendanceSessionRow[];
    const visibleUserIds = [...new Set(rows.flatMap((row) => {
      const assignment = Array.isArray(row.internship_assignments) ? row.internship_assignments[0] : row.internship_assignments;
      const reviewerIds = (row.attendance_verifications ?? []).map((verification) => verification.reviewer_user_id);
      return [...(assignment?.student_user_id ? [assignment.student_user_id] : []), ...reviewerIds];
    }))];
    const nameById = new Map<string, string>();
    if (visibleUserIds.length) {
      const { data: profiles } = await createClient().from("profiles").select("id,first_name,middle_name,last_name,email").in("id", visibleUserIds);
      for (const profile of (profiles ?? []) as Array<{ id: string; first_name: string; middle_name: string | null; last_name: string; email: string }>) {
        nameById.set(profile.id, [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email);
      }
    }
    return rows.map((row) => {
      const events = row.attendance_events ?? [];
      const timeIn = events.find((event) => event.event_type === "time_in");
      const timeOut = events.find((event) => event.event_type === "time_out");
      const verification = [...(row.attendance_verifications ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const minutes = verification?.decision === "verified" ? verification.verified_minutes : null;
      const assignment = Array.isArray(row.internship_assignments) ? row.internship_assignments[0] : row.internship_assignments;
      return {
        id: row.id,
        studentName: assignment?.student_user_id ? nameById.get(assignment.student_user_id) ?? "Assigned intern" : "Assigned intern",
        date: new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${row.work_date}T00:00:00+08:00`)),
        day: new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "long" }).format(new Date(`${row.work_date}T00:00:00+08:00`)),
        timeIn: formatClock(timeIn?.occurred_at),
        timeOut: formatClock(timeOut?.occurred_at),
        hours: minutes == null ? "—" : `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
        status: attendanceStatus(row.status),
        verifiedBy: verification ? nameById.get(verification.reviewer_user_id) ?? "Authorized reviewer" : "—",
        remarks: verification?.remarks ?? "—",
      };
    });
  },
  async getTodaySession(): Promise<AttendanceSession | null> {
    const assignmentId = await activeStudentAssignmentId();
    const { data, error } = await createClient()
      .from("attendance_sessions")
      .select(sessionSelection)
      .eq("internship_assignment_id", assignmentId)
      .eq("work_date", manilaDate())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapSession(data as unknown as AttendanceSessionRow) : null;
  },
  async timeIn(): Promise<AttendanceSession> {
    const supabase = createClient();
    const assignmentId = await activeStudentAssignmentId();
    const { data: existing } = await supabase
      .from("attendance_sessions")
      .select(sessionSelection)
      .eq("internship_assignment_id", assignmentId)
      .eq("work_date", manilaDate())
      .maybeSingle();
    if (existing) return mapSession(existing as unknown as AttendanceSessionRow);

    const { data, error } = await supabase.rpc("record_attendance_event", {
      p_assignment_id: assignmentId,
      p_event_type: "time_in",
      p_source: "web",
      p_latitude: null,
      p_longitude: null,
      p_accuracy_meters: null,
      p_device_metadata: {},
    });
    if (error) throw new Error(error.message);
    const sessionId = (data as { session_id?: string } | null)?.session_id;
    if (!sessionId) throw new Error("Time In was recorded but its attendance session could not be resolved.");
    return readSession(sessionId);
  },
  async timeOut(session: AttendanceSession): Promise<AttendanceSession> {
    if (session.timeOut) return session;
    const { error } = await createClient().rpc("record_attendance_event", {
      p_assignment_id: session.internshipAssignmentId,
      p_event_type: "time_out",
      p_source: "web",
      p_latitude: null,
      p_longitude: null,
      p_accuracy_meters: null,
      p_device_metadata: {},
    });
    if (error) throw new Error(error.message);
    return readSession(session.id);
  },
  async review(sessionId: string, decision: "verified" | "flagged" | "rejected", notes: string): Promise<void> {
    const { error } = await createClient().rpc("review_attendance_session", {
      p_session_id: sessionId,
      p_decision: decision,
      p_remarks: notes.trim() || null,
    });
    if (error) throw new Error(error.message);
  },
};

const dailyLogStatus: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  needs_revision: "Needs Revision",
  rejected: "Rejected",
};

export const dailyLogService = {
  async listLive(): Promise<DailyLogRecord[]> {
    const { data, error } = await createClient()
      .from("daily_logs")
      .select("id,internship_assignment_id,log_date,status,submitted_at,internship_assignments(student_user_id),current_version:daily_log_versions!daily_logs_current_version_fk(hours,activities,learnings,challenges,submitted_at),daily_log_reviews(feedback,reviewed_at)")
      .is("deleted_at", null)
      .order("log_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      internship_assignment_id: string;
      log_date: string;
      status: string;
      submitted_at: string | null;
      current_version?: { hours: number | string; activities: string; learnings: string | null; challenges: string | null; submitted_at: string | null } | Array<{ hours: number | string; activities: string; learnings: string | null; challenges: string | null; submitted_at: string | null }> | null;
      internship_assignments?: { student_user_id?: string } | Array<{ student_user_id?: string }> | null;
      daily_log_reviews?: Array<{ feedback: string | null; reviewed_at: string }> | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    const userIds = [...new Set(rows.flatMap((row) => {
      const assignment = Array.isArray(row.internship_assignments) ? row.internship_assignments[0] : row.internship_assignments;
      return assignment?.student_user_id ? [assignment.student_user_id] : [];
    }))];
    const nameById = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await createClient().from("profiles").select("id,first_name,middle_name,last_name,email").in("id", userIds);
      for (const profile of (profiles ?? []) as Array<{ id: string; first_name: string; middle_name: string | null; last_name: string; email: string }>) {
        nameById.set(profile.id, [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email);
      }
    }
    return rows.map((row) => {
      const assignment = Array.isArray(row.internship_assignments) ? row.internship_assignments[0] : row.internship_assignments;
      const currentVersion = joinedOne(row.current_version);
      const reviews = [...(row.daily_log_reviews ?? [])].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at));
      const dateValue = new Date(`${row.log_date}T00:00:00+08:00`);
      return {
        id: row.id,
        assignmentId: row.internship_assignment_id,
        studentName: assignment?.student_user_id ? nameById.get(assignment.student_user_id) ?? "Assigned intern" : "Assigned intern",
        logDate: row.log_date,
        date: new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(dateValue),
        week: `Week ${Math.ceil(dateValue.getDate() / 7)}`,
        hours: Number(currentVersion?.hours ?? 0),
        summary: currentVersion?.activities ?? "",
        learnings: currentVersion?.learnings ?? "",
        challenges: currentVersion?.challenges ?? "",
        submitted: row.submitted_at ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(row.submitted_at)) : "Draft",
        status: dailyLogStatus[row.status] ?? row.status,
        latestFeedback: reviews[0]?.feedback ?? "",
      };
    });
  },
  async save(input: DailyLogInput, status: "draft" | "submitted" = "submitted"): Promise<void> {
    const assignment = await activeStudentAssignment();
    if (!assignment) throw new Error("No active internship assignment is available for your account.");
    const { error } = await createClient().rpc("save_daily_log", buildSaveDailyLogRpcArgs(input, assignment, status));
    if (error) throw new Error(error.message);
  },
  async review(logId: string, decision: "approved" | "needs_revision" | "rejected", feedback: string): Promise<void> {
    const { error } = await createClient().rpc("review_daily_log", {
      p_daily_log_id: logId,
      p_decision: decision,
      p_feedback: feedback.trim() || null,
    });
    if (error) throw new Error(error.message);
  },
};
export const workflowTemplateService = {
  async listDocumentTemplates(): Promise<DocumentTemplateRecord[]> {
    const { data, error } = await createClient()
      .from("document_requirement_templates")
      .select("id,code,name,description,phase,allowed_mime_types,max_file_size_bytes,is_required,is_active,display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      phase: DocumentTemplatePhase;
      allowed_mime_types: string[];
      max_file_size_bytes: number | string;
      is_required: boolean;
      is_active: boolean;
      display_order: number;
    }>).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? "",
      phase: row.phase,
      allowedMimeTypes: row.allowed_mime_types,
      maxFileSizeBytes: Number(row.max_file_size_bytes),
      isRequired: row.is_required,
      isActive: row.is_active,
      displayOrder: row.display_order,
    }));
  },
  async createDocumentTemplate(input: CreateDocumentTemplateInput): Promise<{ templateId: string; provisionedAssignments: number }> {
    const validationError = validateDocumentTemplate(input);
    if (validationError) throw new Error(validationError);
    const { data, error } = await createClient().rpc("create_document_requirement_template", {
      p_code: normalizeDocumentTemplateCode(input.code),
      p_name: input.name.trim(),
      p_description: input.description.trim(),
      p_phase: input.phase,
      p_allowed_mime_types: input.allowedMimeTypes,
      p_max_file_size_bytes: input.maxFileSizeMb * 1024 * 1024,
      p_is_required: input.isRequired,
      p_is_active: input.isActive,
      p_display_order: input.displayOrder,
    });
    if (error || !data) throw new Error(error?.message ?? "The document template could not be created.");
    const result = data as { template_id?: string; provisioned_assignments?: number };
    return {
      templateId: result.template_id ?? "",
      provisionedAssignments: Number(result.provisioned_assignments ?? 0),
    };
  },
  async listEvaluationTemplates(): Promise<EvaluationTemplateRecord[]> {
    const { data, error } = await createClient()
      .from("evaluation_templates")
      .select("id,code,name,description,stage,evaluator_type,version,is_active,evaluation_criteria(code,label,description,weight,minimum_score,maximum_score,display_order)")
      .order("version", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    type CriterionRow = { code: string; label: string; description: string | null; weight: number | string; minimum_score: number | string; maximum_score: number | string; display_order: number };
    return ((data ?? []) as unknown as Array<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      stage: EvaluationTemplateStage;
      evaluator_type: EvaluationTemplateRecord["evaluatorType"];
      version: number;
      is_active: boolean;
      evaluation_criteria?: CriterionRow[] | null;
    }>).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? "",
      stage: row.stage,
      evaluatorType: row.evaluator_type,
      version: row.version,
      isActive: row.is_active,
      criteria: [...(row.evaluation_criteria ?? [])].sort((a, b) => a.display_order - b.display_order).map((criterion) => ({
        code: criterion.code,
        label: criterion.label,
        description: criterion.description ?? "",
        weight: Number(criterion.weight),
        minimumScore: Number(criterion.minimum_score),
        maximumScore: Number(criterion.maximum_score),
        displayOrder: criterion.display_order,
      })),
    }));
  },
  async createEvaluationTemplate(input: CreateEvaluationTemplateInput): Promise<{ templateId: string; version: number; criteriaCount: number }> {
    const validationError = validateEvaluationTemplate(input);
    if (validationError) throw new Error(validationError);
    const criteria = input.criteria.map((criterion, index) => ({
      code: normalizeEvaluationCode(criterion.code || criterion.label),
      label: criterion.label.trim(),
      description: criterion.description.trim(),
      weight: criterion.weight,
      minimum_score: criterion.minimumScore,
      maximum_score: criterion.maximumScore,
      display_order: index * 10 + 10,
    }));
    const { data, error } = await createClient().rpc("create_evaluation_template", {
      p_code: normalizeEvaluationCode(input.code),
      p_name: input.name.trim(),
      p_description: input.description.trim(),
      p_stage: input.stage,
      p_evaluator_type: input.evaluatorType,
      p_is_active: input.isActive,
      p_criteria: criteria,
    });
    if (error || !data) throw new Error(error?.message ?? "The evaluation template could not be created.");
    const result = data as { template_id?: string; version?: number; criteria_count?: number };
    return {
      templateId: result.template_id ?? "",
      version: Number(result.version ?? 1),
      criteriaCount: Number(result.criteria_count ?? criteria.length),
    };
  },
};

const documentStatus: Record<string, string> = {
  missing: "Missing",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  needs_revision: "Needs Revision",
  rejected: "Rejected",
  waived: "Waived",
};

const documentPhase: Record<string, DocumentRecord["phase"]> = {
  pre_internship: "Pre-Internship",
  during_internship: "During Internship",
  post_internship: "Post-Internship",
};

export const documentService = {
  async listLive(): Promise<DocumentRecord[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("document_requirements")
      .select("id,internship_assignment_id,due_at,status,internship_assignments(student_user_id),document_requirement_templates(name,phase,allowed_mime_types,max_file_size_bytes,display_order)")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      internship_assignment_id: string;
      due_at: string | null;
      status: string;
      internship_assignments?: { student_user_id?: string } | Array<{ student_user_id?: string }> | null;
      document_requirement_templates?: { name: string; phase: string; allowed_mime_types: string[]; max_file_size_bytes: number; display_order: number } | Array<{ name: string; phase: string; allowed_mime_types: string[]; max_file_size_bytes: number; display_order: number }> | null;
      document_submissions?: Array<{ id: string; file_id: string; version_number: number; submitted_at: string; files?: { original_name: string; object_path: string; mime_type: string } | Array<{ original_name: string; object_path: string; mime_type: string }> | null; document_reviews?: Array<{ feedback: string | null; reviewed_at: string }> | null }> | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    const requirementIds = rows.map((row) => row.id);
    if (requirementIds.length) {
      const { data: submissions, error: submissionError } = await supabase
        .from("document_submissions")
        .select("id,document_requirement_id,file_id,version_number,submitted_at,files(original_name,object_path,mime_type),document_reviews(feedback,reviewed_at)")
        .in("document_requirement_id", requirementIds);
      if (submissionError) throw new Error(submissionError.message);
      type SubmissionRow = NonNullable<Row["document_submissions"]>[number] & { document_requirement_id: string };
      const submissionsByRequirement = new Map<string, SubmissionRow[]>();
      for (const submission of (submissions ?? []) as unknown as SubmissionRow[]) {
        submissionsByRequirement.set(submission.document_requirement_id, [...(submissionsByRequirement.get(submission.document_requirement_id) ?? []), submission]);
      }
      for (const row of rows) row.document_submissions = submissionsByRequirement.get(row.id) ?? [];
    }
    const studentIds = [...new Set(rows.flatMap((row) => {
      const assignment = Array.isArray(row.internship_assignments) ? row.internship_assignments[0] : row.internship_assignments;
      return assignment?.student_user_id ? [assignment.student_user_id] : [];
    }))];
    const nameById = new Map<string, string>();
    if (studentIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,first_name,middle_name,last_name,email").in("id", studentIds);
      for (const profile of (profiles ?? []) as Array<{ id: string; first_name: string; middle_name: string | null; last_name: string; email: string }>) {
        nameById.set(profile.id, [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email);
      }
    }

    return rows.map((row) => {
      const assignment = Array.isArray(row.internship_assignments) ? row.internship_assignments[0] : row.internship_assignments;
      const template = Array.isArray(row.document_requirement_templates) ? row.document_requirement_templates[0] : row.document_requirement_templates;
      const submissions = [...(row.document_submissions ?? [])].sort((a, b) => b.version_number - a.version_number);
      const latest = submissions[0];
      const file = Array.isArray(latest?.files) ? latest.files[0] : latest?.files;
      const review = [...(latest?.document_reviews ?? [])].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))[0];
      return {
        id: row.id,
        assignmentId: row.internship_assignment_id,
        studentName: assignment?.student_user_id ? nameById.get(assignment.student_user_id) ?? "Assigned intern" : "Assigned intern",
        templateName: template?.name ?? "Internship document",
        phase: documentPhase[template?.phase ?? ""] ?? "During Internship",
        status: documentStatus[row.status] ?? row.status,
        dueAt: row.due_at ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(row.due_at)) : "No due date",
        fileId: latest?.file_id ?? null,
        submissionId: latest?.id ?? null,
        fileName: file?.original_name ?? "No file uploaded",
        objectPath: file?.object_path ?? null,
        mimeType: file?.mime_type ?? null,
        latestFeedback: review?.feedback ?? "",
        allowedMimeTypes: template?.allowed_mime_types ?? ["application/pdf"],
        maxFileSizeBytes: Number(template?.max_file_size_bytes ?? 20 * 1024 * 1024),
      };
    });
  },
  async upload(requirement: DocumentRecord, selectedFile: File, notes: string): Promise<void> {
    if (!requirement.allowedMimeTypes.includes(selectedFile.type)) {
      throw new Error(`This requirement accepts: ${requirement.allowedMimeTypes.join(", ")}.`);
    }
    if (selectedFile.size > requirement.maxFileSizeBytes) {
      throw new Error(`The selected file exceeds the ${Math.round(requirement.maxFileSizeBytes / 1024 / 1024)} MB limit.`);
    }
    const supabase = createClient();
    const digest = await crypto.subtle.digest("SHA-256", await selectedFile.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
    const { data: preparedRows, error: prepareError } = await supabase.rpc("prepare_document_upload", {
      p_requirement_id: requirement.id,
      p_original_name: selectedFile.name,
      p_mime_type: selectedFile.type,
      p_byte_size: selectedFile.size,
      p_sha256: sha256,
    });
    if (prepareError) throw new Error(prepareError.message);
    const prepared = Array.isArray(preparedRows) ? preparedRows[0] : preparedRows;
    const preparedFile = prepared as { file_id?: string; bucket_id?: string; object_path?: string } | null;
    if (!preparedFile?.file_id || !preparedFile.bucket_id || !preparedFile.object_path) {
      throw new Error("The secure upload path could not be prepared.");
    }

    const { error: uploadError } = await supabase.storage.from(preparedFile.bucket_id).upload(preparedFile.object_path, selectedFile, {
      contentType: selectedFile.type,
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

    const { error: submissionError } = await supabase.rpc("submit_document", {
      p_file_id: preparedFile.file_id,
      p_notes: notes.trim() || null,
    });
    if (submissionError) {
      await supabase.storage.from(preparedFile.bucket_id).remove([preparedFile.object_path]);
      throw new Error(submissionError.message);
    }
  },
  async open(record: DocumentRecord, download = false): Promise<void> {
    if (!record.objectPath) throw new Error("No submitted file is available.");
    const { data, error } = await createClient().storage.from("internship-documents").createSignedUrl(record.objectPath, 60, { download: download ? record.fileName : false });
    if (error || !data?.signedUrl) throw new Error(error?.message ?? "A secure file link could not be created.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  },
  async review(record: DocumentRecord, decision: "approved" | "needs_revision" | "rejected", feedback: string): Promise<void> {
    if (!record.submissionId) throw new Error("No submitted document is available for review.");
    const { error } = await createClient().rpc("review_document_submission", {
      p_submission_id: record.submissionId,
      p_decision: decision,
      p_feedback: feedback.trim() || null,
    });
    if (error) throw new Error(error.message);
  },
};

const evaluationStatus: Record<string, EvaluationRecord["status"]> = {
  draft: "Draft",
  submitted: "Submitted",
  finalized: "Finalized",
  returned: "Returned",
};

async function namesForUsers(userIds: string[]) {
  const nameById = new Map<string, string>();
  if (!userIds.length) return nameById;
  const { data } = await createClient().from("profiles").select("id,first_name,middle_name,last_name,email").in("id", [...new Set(userIds)]);
  for (const profile of (data ?? []) as Array<{ id: string; first_name: string; middle_name: string | null; last_name: string; email: string }>) {
    nameById.set(profile.id, [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email);
  }
  return nameById;
}

export const evaluationService = {
  async listLive(): Promise<EvaluationRecord[]> {
    const { data, error } = await createClient().from("evaluations")
      .select("id,internship_assignment_id,evaluation_template_id,evaluator_user_id,status,weighted_score,submitted_at,internship_assignments(student_user_id),evaluation_templates(name,evaluation_criteria(id,label,description,minimum_score,maximum_score,weight,display_order)),current_version:evaluation_versions!evaluations_current_version_fk(strengths,areas_for_improvement,overall_remarks,submitted_at,evaluation_scores(criterion_id,score)),evaluation_reviews(decision,feedback,reviewed_at)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    type Row = {
      id: string;
      internship_assignment_id: string;
      evaluation_template_id: string;
      evaluator_user_id: string;
      status: string;
      weighted_score: number | string | null;
      submitted_at: string | null;
      current_version?: { strengths: string | null; areas_for_improvement: string | null; overall_remarks: string | null; submitted_at: string | null; evaluation_scores?: Array<{ criterion_id: string; score: number | string }> | null } | Array<{ strengths: string | null; areas_for_improvement: string | null; overall_remarks: string | null; submitted_at: string | null; evaluation_scores?: Array<{ criterion_id: string; score: number | string }> | null }> | null;
      evaluation_reviews?: Array<{ decision: string; feedback: string | null; reviewed_at: string }> | null;
      internship_assignments?: { student_user_id?: string } | Array<{ student_user_id?: string }> | null;
      evaluation_templates?: { name: string; evaluation_criteria?: Array<{ id: string; label: string; description: string | null; minimum_score: number | string; maximum_score: number | string; weight: number | string; display_order: number }> } | Array<{ name: string; evaluation_criteria?: Array<{ id: string; label: string; description: string | null; minimum_score: number | string; maximum_score: number | string; weight: number | string; display_order: number }> }> | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    const userIds = rows.flatMap((row) => {
      const assignment = Array.isArray(row.internship_assignments) ? row.internship_assignments[0] : row.internship_assignments;
      return [row.evaluator_user_id, ...(assignment?.student_user_id ? [assignment.student_user_id] : [])];
    });
    const nameById = await namesForUsers(userIds);
    return rows.map((row) => {
      const assignment = Array.isArray(row.internship_assignments) ? row.internship_assignments[0] : row.internship_assignments;
      const template = Array.isArray(row.evaluation_templates) ? row.evaluation_templates[0] : row.evaluation_templates;
      const currentVersion = joinedOne(row.current_version);
      const latestReview = [...(row.evaluation_reviews ?? [])].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))[0];
      const scoreByCriterion = new Map((currentVersion?.evaluation_scores ?? []).map((score) => [score.criterion_id, Number(score.score)]));
      const criteria = [...(template?.evaluation_criteria ?? [])].sort((a, b) => a.display_order - b.display_order).map((criterion) => ({
        id: criterion.id,
        label: criterion.label,
        description: criterion.description ?? "",
        minimumScore: Number(criterion.minimum_score),
        maximumScore: Number(criterion.maximum_score),
        weight: Number(criterion.weight),
        score: scoreByCriterion.get(criterion.id) ?? 0,
      }));
      return {
        id: row.id,
        assignmentId: row.internship_assignment_id,
        templateId: row.evaluation_template_id,
        templateName: template?.name ?? "Internship Evaluation",
        studentName: assignment?.student_user_id ? nameById.get(assignment.student_user_id) ?? "Assigned intern" : "Assigned intern",
        evaluatorName: nameById.get(row.evaluator_user_id) ?? "Authorized evaluator",
        status: evaluationStatus[row.status] ?? "Draft",
        strengths: currentVersion?.strengths ?? "",
        areasForImprovement: currentVersion?.areas_for_improvement ?? "",
        overallRemarks: currentVersion?.overall_remarks ?? "",
        reviewFeedback: latestReview?.feedback ?? "",
        reviewedAt: latestReview?.reviewed_at ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(latestReview.reviewed_at)) : "",
        weightedScore: row.weighted_score == null ? null : Number(row.weighted_score),
        submittedAt: row.submitted_at ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(row.submitted_at)) : "Not submitted",
        criteria,
      };
    });
  },
  async listAssignments(): Promise<EvaluationAssignment[]> {
    const { data, error } = await createClient().from("internship_assignments").select("id,student_user_id").in("status", ["active", "completed"]).is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string; student_user_id: string }>;
    const names = await namesForUsers(rows.map((row) => row.student_user_id));
    return rows.map((row) => ({ id: row.id, studentName: names.get(row.student_user_id) ?? "Assigned intern" }));
  },
  async getActiveTemplate(): Promise<{ id: string; name: string; criteria: EvaluationCriterionRecord[] }> {
    const { data, error } = await createClient().from("evaluation_templates")
      .select("id,name,evaluation_criteria(id,label,description,minimum_score,maximum_score,weight,display_order)")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) throw new Error(error?.message ?? "No active evaluation template is configured.");
    type Criterion = { id: string; label: string; description: string | null; minimum_score: number | string; maximum_score: number | string; weight: number | string; display_order: number };
    return {
      id: data.id as string,
      name: data.name as string,
      criteria: [...((data.evaluation_criteria ?? []) as unknown as Criterion[])].sort((a, b) => a.display_order - b.display_order).map((criterion) => ({
        id: criterion.id,
        label: criterion.label,
        description: criterion.description ?? "",
        minimumScore: Number(criterion.minimum_score),
        maximumScore: Number(criterion.maximum_score),
        weight: Number(criterion.weight),
        score: 0,
      })),
    };
  },
  async save(input: EvaluationInput): Promise<void> {
    const { error } = await createClient().rpc("save_evaluation", {
      p_assignment_id: input.assignmentId,
      p_template_id: input.templateId,
      p_scores: input.criteria.map((criterion) => ({ criterion_id: criterion.id, score: criterion.score })),
      p_strengths: input.strengths.trim() || null,
      p_areas_for_improvement: input.areasForImprovement.trim() || null,
      p_overall_remarks: input.overallRemarks.trim() || null,
      p_submit: input.submit,
      p_evaluation_id: input.id ?? null,
    });
    if (error) throw new Error(error.message);
  },
  async review(evaluationId: string, decision: "finalized" | "returned", feedback: string): Promise<void> {
    if (decision === "returned" && !feedback.trim()) throw new Error("Enter feedback before returning this evaluation.");
    const { error } = await createClient().rpc("review_evaluation", {
      p_evaluation_id: evaluationId,
      p_decision: decision,
      p_feedback: feedback.trim() || null,
    });
    if (error) throw new Error(error.message);
  },
};

export const notificationService = {
  async listLive(): Promise<NotificationRecord[]> {
    const userId = await currentUserId();
    const { data, error } = await createClient().from("notification_recipients")
      .select("notification_id,read_at,created_at,notifications(id,title,message,severity,created_at)")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    type Row = { notification_id: string; read_at: string | null; notifications?: { id: string; title: string; message: string; severity: NotificationRecord["tone"]; created_at: string } | Array<{ id: string; title: string; message: string; severity: NotificationRecord["tone"]; created_at: string }> | null };
    return ((data ?? []) as unknown as Row[]).flatMap((row) => {
      const notification = Array.isArray(row.notifications) ? row.notifications[0] : row.notifications;
      if (!notification) return [];
      return [{
        id: notification.id,
        title: notification.title,
        message: notification.message,
        tone: notification.severity,
        time: new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(notification.created_at)),
        unread: !row.read_at,
      }];
    });
  },
  async markRead(notificationId: string): Promise<void> {
    const { error } = await createClient().rpc("mark_notification_read", {
      p_notification_id: notificationId,
      p_read: true,
    });
    if (error) throw new Error(error.message);
  },
  async markAllRead(): Promise<void> {
    const { error } = await createClient().rpc("mark_all_notifications_read");
    if (error) throw new Error(error.message);
  },
  async getPreferences(): Promise<{ emailNotifications: boolean; weeklyProgressSummary: boolean; monitoringNotices: boolean }> {
    const userId = await currentUserId();
    const { data, error } = await createClient().from("notification_preferences")
      .select("email_notifications,weekly_progress_summary,monitoring_notices").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return {
      emailNotifications: data?.email_notifications ?? true,
      weeklyProgressSummary: data?.weekly_progress_summary ?? true,
      monitoringNotices: data?.monitoring_notices ?? false,
    };
  },
  async savePreferences(preferences: { emailNotifications: boolean; weeklyProgressSummary: boolean; monitoringNotices: boolean }): Promise<void> {
    const userId = await currentUserId();
    const { error } = await createClient().from("notification_preferences").upsert({
      user_id: userId,
      email_notifications: preferences.emailNotifications,
      weekly_progress_summary: preferences.weeklyProgressSummary,
      monitoring_notices: preferences.monitoringNotices,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
  },
};
export const adminService = {
  async getSummary(): Promise<AdminSummary> {
    const supabase = createClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [accounts, registrations, assignments, audits] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("account_status", "active").is("deleted_at", null),
      supabase.from("registration_applications").select("id", { count: "exact", head: true }).in("status", ["pending", "under_review"]).is("deleted_at", null),
      supabase.from("role_assignments").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }).gte("occurred_at", since),
    ]);
    const failure = [accounts, registrations, assignments, audits].find((result) => result.error);
    if (failure?.error) throw new Error(failure.error.message);
    return {
      activeAccounts: accounts.count ?? 0,
      pendingRegistrations: registrations.count ?? 0,
      roleAssignments: assignments.count ?? 0,
      securityEvents: audits.count ?? 0,
    };
  },
  async listUserAccounts(): Promise<UserAccountRecord[]> {
    const supabase = createClient();
    const [profilesResult, assignmentsResult, studentsResult, staffResult, representativesResult] = await Promise.all([
      supabase.from("profiles").select("id,email,first_name,middle_name,last_name,preferred_name,account_status").is("deleted_at", null).order("last_name").order("first_name"),
      supabase.from("role_assignments").select("user_id,starts_at,ends_at,roles(code,name)").is("deleted_at", null),
      supabase.from("student_profiles").select("user_id,student_number").is("deleted_at", null),
      supabase.from("staff_profiles").select("user_id,employee_number").is("deleted_at", null),
      supabase.from("hte_representatives").select("user_id,starts_on,ends_on,hte_organizations(name,trade_name)").is("deleted_at", null),
    ]);
    const failed = [profilesResult, assignmentsResult, studentsResult, staffResult, representativesResult].find((result) => result.error);
    if (failed?.error) throw new Error(failed.error.message);

    type ProfileRow = { id: string; email: string; first_name: string; middle_name: string | null; last_name: string; preferred_name: string | null; account_status: string };
    type AssignmentRow = { user_id: string; starts_at: string; ends_at: string | null; roles?: { code: string; name: string } | Array<{ code: string; name: string }> | null };
    type StudentRow = { user_id: string; student_number: string };
    type StaffRow = { user_id: string; employee_number: string };
    type RepresentativeRow = { user_id: string; starts_on: string | null; ends_on: string | null; hte_organizations?: { name: string; trade_name: string | null } | Array<{ name: string; trade_name: string | null }> | null };
    const now = Date.now();
    const rolesByUser = new Map<string, string[]>();
    for (const assignment of (assignmentsResult.data ?? []) as unknown as AssignmentRow[]) {
      if (new Date(assignment.starts_at).getTime() > now || (assignment.ends_at && new Date(assignment.ends_at).getTime() <= now)) continue;
      const role = joinedOne(assignment.roles);
      if (!role) continue;
      rolesByUser.set(assignment.user_id, [...(rolesByUser.get(assignment.user_id) ?? []), role.name]);
    }
    const studentNumbers = new Map(((studentsResult.data ?? []) as StudentRow[]).map((row) => [row.user_id, row.student_number]));
    const employeeNumbers = new Map(((staffResult.data ?? []) as StaffRow[]).map((row) => [row.user_id, row.employee_number]));
    const hteReferences = new Map<string, string>();
    const today = new Date().toISOString().slice(0, 10);
    for (const representative of (representativesResult.data ?? []) as unknown as RepresentativeRow[]) {
      if ((representative.starts_on && representative.starts_on > today) || (representative.ends_on && representative.ends_on < today)) continue;
      const hte = joinedOne(representative.hte_organizations);
      if (hte) hteReferences.set(representative.user_id, hte.trade_name ?? hte.name);
    }
    const displayStatus = (status: string) => status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
    return ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => ({
      id: profile.id,
      name: profile.preferred_name?.trim() || [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email,
      email: profile.email,
      role: rolesByUser.get(profile.id)?.join(", ") || "No active role",
      reference: studentNumbers.get(profile.id) ?? employeeNumbers.get(profile.id) ?? hteReferences.get(profile.id) ?? profile.email,
      status: displayStatus(profile.account_status),
    }));
  },
  async sendPasswordReset(email: string): Promise<void> {
    const fallbackOrigin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
    const redirectTo = `${getSiteOrigin(fallbackOrigin)}/reset-password`;
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (error) throw new Error(error.message);
  },
  async listRolePolicies(): Promise<RolePolicyRecord[]> {
    const supabase = createClient();
    const [rolesResult, assignmentsResult] = await Promise.all([
      supabase.from("roles").select("id,code,name,description,is_active,allows_global_scope,role_permissions(permissions(code,description))").order("name"),
      supabase.from("role_assignments").select("role_id").is("deleted_at", null),
    ]);
    if (rolesResult.error) throw new Error(rolesResult.error.message);
    if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
    const counts = new Map<string, number>();
    for (const row of (assignmentsResult.data ?? []) as Array<{ role_id: string }>) counts.set(row.role_id, (counts.get(row.role_id) ?? 0) + 1);
    type RoleRow = { id: string; code: string; name: string; description: string | null; is_active: boolean; allows_global_scope: boolean; role_permissions?: Array<{ permissions?: { code: string; description: string | null } | Array<{ code: string; description: string | null }> | null }> | null };
    return ((rolesResult.data ?? []) as unknown as RoleRow[]).map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description ?? "No policy description has been configured.",
      scope: role.allows_global_scope ? "Global when explicitly assigned" : role.code === "student_intern" ? "Own internship record" : role.code === "hte_supervisor" ? "Assigned HTE and interns" : "Authorized organization/program scope",
      accounts: counts.get(role.id) ?? 0,
      active: role.is_active,
      permissions: (role.role_permissions ?? []).flatMap((item) => {
        const permission = joinedOne(item.permissions);
        return permission ? [{ code: permission.code, description: permission.description ?? "" }] : [];
      }).sort((left, right) => left.code.localeCompare(right.code)),
    }));
  },
  async listAuditLogs(): Promise<AuditLogRecord[]> {
    const { data, error } = await createClient().from("audit_logs")
      .select("id,actor_user_id,action,entity_schema,entity_type,entity_id,metadata,occurred_at")
      .order("occurred_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    type AuditRow = { id: string; actor_user_id: string | null; action: string; entity_schema: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown> | null; occurred_at: string };
    const rows = (data ?? []) as AuditRow[];
    const names = await namesForUsers(rows.flatMap((row) => row.actor_user_id ? [row.actor_user_id] : []));
    return rows.map((row) => ({
      id: row.id,
      action: row.action.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      actor: row.actor_user_id ? names.get(row.actor_user_id) ?? "Authorized user" : "System",
      entity: `${row.entity_schema}.${row.entity_type}${row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ""}`,
      occurredAt: row.occurred_at,
      metadata: row.metadata ?? {},
    }));
  },
  async reviewHteOrganization(hteId: string, decision: "verified" | "rejected", notes: string): Promise<void> {
    const { error } = await createClient().rpc("review_hte_organization", {
      p_hte_id: hteId,
      p_decision: decision,
      p_notes: notes.trim() || null,
    });
    if (error) throw new Error(error.message);
  },
};

export const coordinatorService = {
  async listPartnerHtes(): Promise<PartnerHteRecord[]> {
    const supabase = createClient();
    const [hteResult, assignmentResult] = await Promise.all([
      supabase.from("hte_organizations").select("id,name,trade_name,industry,city_municipality,province,verification_status,hte_representatives(user_id,is_primary,starts_on,ends_on,deleted_at)").is("deleted_at", null).order("name"),
      supabase.from("internship_assignments").select("hte_id").is("deleted_at", null).not("status", "in", "(draft,cancelled)"),
    ]);
    if (hteResult.error) throw new Error(hteResult.error.message);
    if (assignmentResult.error) throw new Error(assignmentResult.error.message);
    type HteRow = { id: string; name: string; trade_name: string | null; industry: string | null; city_municipality: string | null; province: string | null; verification_status: string; hte_representatives?: Array<{ user_id: string; is_primary: boolean; starts_on: string | null; ends_on: string | null; deleted_at: string | null }> | null };
    const hteRows = (hteResult.data ?? []) as unknown as HteRow[];
    const today = new Date().toISOString().slice(0, 10);
    const representatives = hteRows.flatMap((hte) => (hte.hte_representatives ?? []).filter((row) => !row.deleted_at && (!row.starts_on || row.starts_on <= today) && (!row.ends_on || row.ends_on >= today)));
    const names = await namesForUsers(representatives.map((row) => row.user_id));
    const counts = new Map<string, number>();
    for (const row of (assignmentResult.data ?? []) as Array<{ hte_id: string }>) counts.set(row.hte_id, (counts.get(row.hte_id) ?? 0) + 1);
    return hteRows.map((hte) => {
      const representative = [...(hte.hte_representatives ?? [])].filter((row) => !row.deleted_at && (!row.starts_on || row.starts_on <= today) && (!row.ends_on || row.ends_on >= today)).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
      return {
        id: hte.id,
        name: hte.trade_name ?? hte.name,
        representative: representative ? names.get(representative.user_id) ?? "Authorized representative" : "Not assigned",
        assignedInterns: counts.get(hte.id) ?? 0,
        status: hte.verification_status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        industry: hte.industry ?? "Not specified",
        location: [hte.city_municipality, hte.province].filter(Boolean).join(", ") || "Not specified",
      };
    });
  },
  async createPartnerHte(input: { name: string; registrationNumber: string; industry: string; address: string; city: string; province: string; email: string; phone: string }): Promise<void> {
    const { error } = await createClient().rpc("create_partner_hte", {
      p_name: input.name,
      p_registration_number: input.registrationNumber || null,
      p_industry: input.industry || null,
      p_address_line: input.address,
      p_city_municipality: input.city || null,
      p_province: input.province || null,
      p_contact_email: input.email || null,
      p_contact_phone: input.phone || null,
    });
    if (error) throw new Error(error.message);
  },
  async getAssignmentOptions(): Promise<AssignmentOptions> {
    const { data, error } = await createClient().rpc("get_coordinator_assignment_options");
    if (error) throw new Error(error.message);
    const payload = (data ?? {}) as { students?: AssignmentOption[]; htes?: AssignmentOption[]; terms?: Array<AssignmentOption & { startsOn: string; endsOn: string }> };
    return { students: payload.students ?? [], htes: payload.htes ?? [], terms: payload.terms ?? [] };
  },
  async createAssignment(input: CreateAssignmentInput): Promise<void> {
    const { error } = await createClient().rpc("create_coordinator_assignment", {
      p_student_user_id: input.studentUserId,
      p_hte_id: input.hteId,
      p_academic_term_id: input.academicTermId,
      p_required_hours: input.requiredHours,
      p_start_date: input.startDate,
      p_expected_end_date: input.expectedEndDate,
      p_submit_for_approval: input.submitForApproval,
    });
    if (error) throw new Error(error.message);
  },
};

export const feedbackService = {
  async listLive(): Promise<FeedbackRecord[]> {
    const { data, error } = await createClient().from("internship_feedback")
      .select("id,internship_assignment_id,author_user_id,subject,message,status,created_at,internship_assignments(student_user_id)")
      .is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    type Row = { id: string; internship_assignment_id: string; author_user_id: string; subject: string; message: string; status: string; created_at: string; internship_assignments?: { student_user_id: string } | Array<{ student_user_id: string }> | null };
    const rows = (data ?? []) as unknown as Row[];
    const userIds = rows.flatMap((row) => [row.author_user_id, ...(joinedOne(row.internship_assignments)?.student_user_id ? [joinedOne(row.internship_assignments)!.student_user_id] : [])]);
    const names = await namesForUsers(userIds);
    return rows.map((row) => {
      const studentId = joinedOne(row.internship_assignments)?.student_user_id;
      return {
        id: row.id,
        assignmentId: row.internship_assignment_id,
        studentName: studentId ? names.get(studentId) ?? "Assigned intern" : "Assigned intern",
        subject: row.subject,
        message: row.message,
        authorName: names.get(row.author_user_id) ?? "Authorized user",
        createdAt: row.created_at,
        status: row.status === "resolved" ? "Resolved" : row.status === "in_progress" ? "In Progress" : "Open",
      };
    });
  },
  async create(input: { assignmentId: string; subject: string; message: string }): Promise<void> {
    const { error } = await createClient().rpc("create_internship_feedback", {
      p_assignment_id: input.assignmentId,
      p_subject: input.subject,
      p_message: input.message,
    });
    if (error) throw new Error(error.message);
  },
};
export const registrationService = {
  async listLivePending(): Promise<RegistrationRecord[]> {
    const { data, error } = await createClient()
      .from("registration_applications")
      .select("id,email,reference_no,submitted_data,status,created_at,roles(code)")
      .in("status", ["pending", "under_review"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const roleNames: Record<string, string> = {
      student_intern: "Student Intern",
      internship_coordinator: "Internship Coordinator",
      hte_supervisor: "HTE Representative",
    };
    return ((data ?? []) as unknown as Array<{ id: string; email: string; reference_no: string | null; submitted_data: Record<string, unknown>; status: string; created_at: string; roles?: { code: string } | Array<{ code: string }> | null }>).map((row) => {
      const details = Object.fromEntries(Object.entries(row.submitted_data ?? {}).filter(([, value]) => typeof value === "string").map(([key, value]) => [key, String(value)]));
      const personName = [details.first_name, details.middle_name, details.last_name].filter(Boolean).join(" ").trim();
      const requestedRole = joinedOne(row.roles)?.code ?? "unknown";
      return {
        id: row.id,
        name: details.organization_name || personName || row.email,
        email: row.email,
        role: roleNames[requestedRole] ?? requestedRole,
        reference: row.reference_no ?? "—",
        submitted: new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(row.created_at)),
        status: row.status === "under_review" ? "Under Review" : "Pending",
        details,
      };
    });
  },
  async review(applicationId: string, decision: "approved" | "rejected", notes: string): Promise<void> {
    const { error } = await createClient().rpc("review_registration", {
      p_application_id: applicationId,
      p_decision: decision,
      p_notes: notes.trim() || null,
    });
    if (error) throw new Error(error.message);
  },
};

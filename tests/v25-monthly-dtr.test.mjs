import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  daysInReportingMonth,
  dailyFormValues,
  generateMonthlyDtrPdf,
  validateMonthlyDtrSnapshot,
} from "../lib/monthly-dtr-report.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261013000000_v25_monthly_dtr.sql");
const workspace = await read("../app/components/MonthlyDtrWorkspace.tsx");
const app = await read("../app/PraxizApp.tsx");
const services = await read("../app/services/praxiz-services.ts");
const route = await read("../app/api/dtr/[id]/pdf/route.ts");
const auth = await read("../app/auth/supabase-auth.tsx");
const analyticsRoute = await read("../app/api/ai/analytics/route.ts");
const reportSource = await read("../lib/monthly-dtr-report.ts");
const originalForm = new Uint8Array(
  await readFile(
    new URL("../lib/report-assets/form-48-original.pdf", import.meta.url),
  ),
);

const snapshot = {
  reportId: "00000000-0000-4000-8000-000000000099",
  assignmentId: "00000000-0000-4000-8000-000000000098",
  reportingMonth: "2028-02-01",
  reportReference: "DTR-QA-202802-V1",
  version: 1,
  verificationStatus: "provisional",
  submissionStatus: "not_submitted",
  generatedAt: "2028-03-01T00:00:00Z",
  finalizedAt: null,
  finalizedBy: null,
  verificationRemarks: null,
  student: {
    name: "QA Student",
    studentNumber: "QA-001",
    campus: "Goa Main Campus",
    academicUnit: "College of Computing",
    program: "BSIT",
    section: "4A",
  },
  internship: {
    hte: "QA Organization",
    academicYear: "AY 2027-2028",
    academicTerm: "2nd Semester",
    requiredHours: 400,
    dailyRequiredHours: 8,
  },
  sessions: [
    {
      sessionId: "00000000-0000-4000-8000-000000000001",
      workDate: "2028-02-01",
      timeInAt: "2028-02-01T00:00:00Z",
      timeOutAt: "2028-02-01T08:00:00Z",
      recordedMinutes: 480,
      verifiedMinutes: null,
      status: "completed",
      verificationRemarks: null,
      verifiedBy: null,
    },
  ],
  totals: {
    recordedMinutes: 480,
    verifiedMinutes: 0,
    recordedSessions: 1,
    verifiedSessions: 0,
    exceptionCount: 0,
  },
};

test("Form 48 leaves ambiguous overnight departure and unverified undertime blank", () => {
  const base = snapshot.sessions[0];
  assert.equal(dailyFormValues([{ ...base, recordedMinutes: 60 }], 8).undertimeHours, "");
  const overnight = { ...base, timeInAt: "2028-02-01T14:00:00Z", timeOutAt: "2028-02-01T22:00:00Z", status: "verified", verifiedMinutes: 480 };
  const result = dailyFormValues([overnight], 8);
  assert.equal(result.pmArrival, "10:00");
  assert.equal(result.amDeparture, "");
  assert.equal(result.undertimeTotal, 0);
  assert.equal(dailyFormValues([{ ...base, status: "verified", verifiedMinutes: 420 }], 8).undertimeHours, "1");
  assert.equal(dailyFormValues([{ ...base, status: "verified", verifiedMinutes: 420 }], null).undertimeHours, "");
});

test("Form 48 maps actual AM, PM, split, and incomplete sessions without inventing punches", () => {
  const base = snapshot.sessions[0];
  const amOnly = dailyFormValues([{
    ...base,
    timeInAt: "2028-02-01T00:00:00Z",
    timeOutAt: "2028-02-01T03:30:00Z",
  }], 8);
  assert.deepEqual(
    [amOnly.amArrival, amOnly.amDeparture, amOnly.pmArrival, amOnly.pmDeparture],
    ["8:00", "11:30", "", ""],
  );

  const pmOnly = dailyFormValues([{
    ...base,
    timeInAt: "2028-02-01T05:00:00Z",
    timeOutAt: "2028-02-01T09:00:00Z",
  }], 8);
  assert.deepEqual(
    [pmOnly.amArrival, pmOnly.amDeparture, pmOnly.pmArrival, pmOnly.pmDeparture],
    ["", "", "1:00", "5:00"],
  );

  const continuous = dailyFormValues([base], 8);
  assert.deepEqual(
    [continuous.amArrival, continuous.amDeparture, continuous.pmArrival, continuous.pmDeparture],
    ["8:00", "", "", "4:00"],
  );

  const split = dailyFormValues([
    { ...base, timeOutAt: "2028-02-01T03:59:00Z", verifiedMinutes: 239 },
    {
      ...base,
      sessionId: "00000000-0000-4000-8000-000000000002",
      timeInAt: "2028-02-01T05:00:00Z",
      timeOutAt: "2028-02-01T09:00:00Z",
      verifiedMinutes: 241,
    },
  ], 8);
  assert.deepEqual(
    [split.amArrival, split.amDeparture, split.pmArrival, split.pmDeparture],
    ["8:00", "11:59", "1:00", "5:00"],
  );

  const incomplete = dailyFormValues([{ ...base, timeOutAt: null }], 8);
  assert.deepEqual(
    [incomplete.amArrival, incomplete.amDeparture, incomplete.pmArrival, incomplete.pmDeparture],
    ["8:00", "", "", ""],
  );
  assert.equal(incomplete.undertimeHours, "");
});

test("Form 48 refuses to truncate an overfilled attendance cell", async () => {
  const sessions = [0, 10, 20, 30].map((minute, index) => ({
    ...snapshot.sessions[0],
    sessionId: `00000000-0000-4000-8000-00000000000${index + 1}`,
    timeInAt: `2028-02-01T00:${String(minute).padStart(2, "0")}:00Z`,
    timeOutAt: `2028-02-01T01:${String(minute).padStart(2, "0")}:00Z`,
    verifiedMinutes: 60,
    status: "verified",
  }));
  await assert.rejects(
    generateMonthlyDtrPdf({ ...snapshot, sessions }, { form: originalForm }),
    /more punches than one Form 48 cell can display accurately/,
  );
});

test("V25 monthly DTR handles every calendar month and rejects invalid snapshots", () => {
  assert.equal(daysInReportingMonth("2028-02-01"), 29);
  assert.equal(daysInReportingMonth("2027-02-01"), 28);
  assert.equal(daysInReportingMonth("2026-04-01"), 30);
  assert.equal(daysInReportingMonth("2026-10-01"), 31);
  assert.throws(() => daysInReportingMonth("2026-10-02"), /first day/);
  assert.throws(
    () => validateMonthlyDtrSnapshot({
      ...snapshot,
      sessions: [{ ...snapshot.sessions[0], workDate: "2028-03-01" }],
    }),
    /outside its reporting month/,
  );
  assert.throws(
    () => validateMonthlyDtrSnapshot({
      ...snapshot,
      sessions: [{ ...snapshot.sessions[0], recordedMinutes: 1441 }],
    }),
    /invalid attendance minutes/,
  );
});

test("V26 DTR is exactly one narrow original Form 48 front", async () => {
  const bytes = await generateMonthlyDtrPdf(snapshot, { form: originalForm });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getForm().getFields().length, 0);
  assert.equal(Math.round(pdf.getPage(0).getWidth()), 306);
  assert.equal(Math.round(pdf.getPage(0).getHeight()), 936);
  assert.match(reportSource, /Civil Service Form No\. 48/);
  assert.match(reportSource, /Remove the source form's obsolete reference to a back page/);
  assert.doesNotMatch(reportSource, /PROVISIONAL - NOT YET VERIFIED/);
  assert.doesNotMatch(reportSource, /not represented as an officially approved CSC Form 48/);
});

test("V25 migration freezes verified snapshots and preserves first submission provenance", () => {
  assert.match(migration, /attendance_snapshot jsonb not null/);
  assert.match(migration, /snapshot_hash text not null/);
  assert.match(migration, /unique \(monthly_dtr_report_id, recipient_coordinator_user_id\)/);
  assert.match(migration, /on conflict \(monthly_dtr_report_id, recipient_coordinator_user_id\) do nothing/);
  assert.match(migration, /v_report\.verification_status <> 'verified'/);
  assert.match(migration, /private\.can_verify_monthly_dtr_assignment/);
  assert.match(migration, /Resolve every incomplete, pending, flagged, or rejected session before monthly finalization/);
  assert.doesNotMatch(migration, /event\.deleted_at/);
  assert.doesNotMatch(migration, /monthly_dtr_submission', v_submission\.id/);
});

test("V25 DTR endpoint and UI keep access protected and actions explicit", () => {
  assert.match(route, /supabase\.auth\.getUser/);
  assert.match(route, /get_monthly_dtr_report/);
  assert.doesNotMatch(route, /service_role|SUPABASE_SERVICE_ROLE/);
  assert.match(workspace, /Finalize monthly DTR\?/);
  assert.match(workspace, /Submit monthly DTR\?/);
  assert.match(workspace, /preserve the original sender and timestamp/);
  assert.match(workspace, /Only recorded attendance is placed in the PDF/);
  assert.match(workspace, /unsupported fields and signatures remain blank/);
});

test("password recovery consumes only recovery credentials before any existing session", () => {
  const codeIndex = auth.indexOf('url.searchParams.get("code")');
  const currentSessionIndex = auth.indexOf("supabase.auth.getSession()", codeIndex);
  assert.ok(codeIndex >= 0 && currentSessionIndex > codeIndex);
  assert.match(auth, /tokenHash && recoveryType === "recovery"/);
  assert.doesNotMatch(auth, /recoveryType === "recovery" \|\| recoveryType === "invite"/);
  assert.match(auth, /clearRecoveryCredentials\(url\)/);
  assert.match(auth, /PASSWORD_RECOVERY_SESSION_KEY/);
  assert.match(auth, /INVITATION_SESSION_KEY/);
  assert.match(auth, /async acceptInvitation\(tokenHash\)/);
  assert.match(auth, /event === "PASSWORD_RECOVERY"/);
  assert.match(auth, /recoveryUserId === current\.data\.session\.user\.id/);
  assert.match(auth, /return null;/);
});

test("bulk assignments are atomic and preserve per-student requirement snapshots", () => {
  assert.match(migration, /create_coordinator_assignments_bulk\(p_assignments jsonb\)/);
  assert.match(migration, /perform public\.create_coordinator_assignment/);
  assert.match(migration, /Each Student Intern may appear only once/);
  assert.match(migration, /Bulk assignment failed for Student Intern/);
  assert.match(services, /createAssignmentsBulk/);
  assert.match(app, /Assign multiple Student Interns/);
  assert.match(app, /getRequirementConfig\(id, termId\)/);
  assert.match(app, /The entire batch is rolled back if any assignment fails/);
});

test("sign-in remember-email control retains its own accessible name", () => {
  assert.match(
    app,
    /aria-label="Remember my email on this device"[\s\S]*?Remember my email on this device/,
  );
});

test("HTE setup and reviewed Weekly Logs expose honest current and read-only states", () => {
  assert.match(app, /record\.effectiveFrom <= todayInManila/);
  assert.match(app, /Multiple configurations currently apply/);
  assert.match(app, /Initial configuration/);
  assert.match(app, /Daily-hours configuration details/);
  assert.match(app, /log\.status !== "Submitted"/);
  assert.match(app, /View details/);
});

test("AI analytics records safe stage and duration diagnostics without exposing provider data", () => {
  assert.match(analyticsRoute, /stage = "load-authorized-assignments"/);
  assert.match(analyticsRoute, /stage = "generate-insights"/);
  assert.match(analyticsRoute, /durationMs: Date\.now\(\) - startedAt/);
  assert.match(analyticsRoute, /code: failure\.body\.kind/);
  assert.doesNotMatch(analyticsRoute, /console\.error\([^\n]*prompt/);
});

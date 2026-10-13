import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  generateMonthlyDtrPdf,
  type MonthlyDtrSessionSnapshot,
  type MonthlyDtrSnapshot,
} from "../lib/monthly-dtr-report.ts";

const sessions: MonthlyDtrSessionSnapshot[] = [
  ["01", "2026-10-01T00:00:00Z", "2026-10-01T08:00:00Z", 480],
  ["02", "2026-10-02T00:15:00Z", "2026-10-02T08:30:00Z", 495],
  ["05", "2026-10-05T00:05:00Z", "2026-10-05T04:00:00Z", 235],
  ["05", "2026-10-05T05:00:00Z", "2026-10-05T09:05:00Z", 245],
  ["06", "2026-10-06T13:30:00Z", "2026-10-06T21:30:00Z", 480],
  ["08", "2026-10-08T00:00:00Z", "2026-10-08T08:00:00Z", 480],
].map(([day, timeInAt, timeOutAt, minutes], index) => ({
  sessionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  workDate: `2026-10-${day}`,
  timeInAt: String(timeInAt),
  timeOutAt: String(timeOutAt),
  recordedMinutes: Number(minutes),
  verifiedMinutes: Number(minutes),
  status: "verified",
  verificationRemarks: index === 4 ? "Authorized overnight assignment session." : null,
  verifiedBy: "HTE QA Fixture Reviewer",
}));

const totalMinutes = sessions.reduce((sum, item) => sum + (item.verifiedMinutes ?? 0), 0);
const snapshot: MonthlyDtrSnapshot = {
  reportId: "00000000-0000-4000-8000-000000000099",
  assignmentId: "00000000-0000-4000-8000-000000000098",
  reportingMonth: "2026-10-01",
  reportReference: "DTR-FIXTURE-202610-V1",
  version: 1,
  verificationStatus: "verified",
  submissionStatus: "not_submitted",
  generatedAt: "2026-10-13T02:00:00Z",
  finalizedAt: "2026-10-13T02:15:00Z",
  finalizedBy: "HTE QA Fixture Reviewer",
  verificationRemarks: "QA fixture only - no production student or attendance data.",
  student: {
    name: "V25 QA FIXTURE - Maria Dela Cruz",
    studentNumber: "FIXTURE-2026-001",
    campus: "Goa Main Campus",
    academicUnit: "College of Computing",
    program: "BSIT - Bachelor of Science in Information Technology",
    section: "BSIT 4A",
  },
  internship: {
    hte: "PRAXIZ Fixture Technology Services",
    academicYear: "AY 2026-2027",
    academicTerm: "1st Semester",
    requiredHours: 400,
    dailyRequiredHours: 8,
  },
  sessions,
  totals: {
    recordedMinutes: totalMinutes,
    verifiedMinutes: totalMinutes,
    recordedSessions: sessions.length,
    verifiedSessions: sessions.length,
    exceptionCount: 0,
  },
};

const output = resolve("output/pdf/PRAXIZ-V25-Monthly-DTR-Fixture.pdf");
await mkdir(dirname(output), { recursive: true });
const bytes = await generateMonthlyDtrPdf(snapshot, {
  font: new Uint8Array(await readFile(resolve("lib/report-assets/DejaVuSans.ttf"))),
  seal: new Uint8Array(await readFile(resolve("lib/report-assets/parsu-logo.png"))),
});
await writeFile(output, bytes);
console.log(output);

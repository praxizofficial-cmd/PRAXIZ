import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb, type PDFFont } from "pdf-lib";

export type MonthlyDtrVerificationStatus =
  | "provisional"
  | "under_review"
  | "needs_correction"
  | "verified";

export type MonthlyDtrSubmissionStatus =
  | "not_submitted"
  | "submitted"
  | "superseded";

export type MonthlyDtrSessionSnapshot = {
  sessionId: string;
  workDate: string;
  timeInAt: string | null;
  timeOutAt: string | null;
  recordedMinutes: number | null;
  verifiedMinutes: number | null;
  status: string;
  verificationRemarks: string | null;
  verifiedBy: string | null;
};

export type MonthlyDtrSnapshot = {
  reportId: string;
  assignmentId: string;
  reportingMonth: string;
  reportReference: string;
  version: number;
  verificationStatus: MonthlyDtrVerificationStatus;
  submissionStatus: MonthlyDtrSubmissionStatus;
  generatedAt: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
  verificationRemarks: string | null;
  student: {
    name: string;
    studentNumber: string;
    campus: string;
    academicUnit: string;
    program: string;
    section: string;
  };
  internship: {
    hte: string;
    academicYear: string;
    academicTerm: string;
    requiredHours: number | null;
    dailyRequiredHours: number | null;
  };
  sessions: MonthlyDtrSessionSnapshot[];
  totals: {
    recordedMinutes: number;
    verifiedMinutes: number;
    recordedSessions: number;
    verifiedSessions: number;
    exceptionCount: number;
  };
};

type ReportAssets = { font: Uint8Array; seal: Uint8Array };

function assertIsoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date.`);
  }
}

export function daysInReportingMonth(reportingMonth: string) {
  assertIsoDate(reportingMonth, "Reporting month");
  const [year, month, day] = reportingMonth.split("-").map(Number);
  if (day !== 1) throw new Error("Reporting month must be the first day of a calendar month.");
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function validateMonthlyDtrSnapshot(snapshot: MonthlyDtrSnapshot) {
  if (!snapshot.reportId || !snapshot.assignmentId || !snapshot.reportReference) {
    throw new Error("The monthly DTR identity is incomplete.");
  }
  const dayCount = daysInReportingMonth(snapshot.reportingMonth);
  if (!Number.isInteger(snapshot.version) || snapshot.version < 1) {
    throw new Error("The monthly DTR version is invalid.");
  }
  if (!snapshot.student.name.trim() || !snapshot.internship.hte.trim()) {
    throw new Error("The monthly DTR student or HTE identity is incomplete.");
  }
  const prefix = snapshot.reportingMonth.slice(0, 7);
  for (const session of snapshot.sessions) {
    assertIsoDate(session.workDate, "Attendance work date");
    const day = Number(session.workDate.slice(-2));
    if (!session.sessionId || !session.workDate.startsWith(prefix) || day < 1 || day > dayCount) {
      throw new Error("The monthly DTR contains an attendance session outside its reporting month.");
    }
    for (const minutes of [session.recordedMinutes, session.verifiedMinutes]) {
      if (minutes != null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60)) {
        throw new Error("The monthly DTR contains invalid attendance minutes.");
      }
    }
  }
}

function formatMinutes(value: number | null) {
  if (value == null) return "-";
  return `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, "0")}m`;
}

function formatClock(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function fitText(value: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  const suffix = "...";
  let result = value;
  while (result && font.widthOfTextAtSize(`${result}${suffix}`, size) > width) {
    result = result.slice(0, -1);
  }
  return `${result}${suffix}`;
}

function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function daySummary(sessions: MonthlyDtrSessionSnapshot[]) {
  if (!sessions.length) {
    return {
      timeIn: "",
      timeOut: "",
      recorded: "",
      verified: "",
      status: "No record",
      remarks: "",
    };
  }
  const recorded = sessions.reduce((sum, item) => sum + (item.recordedMinutes ?? 0), 0);
  const verified = sessions.reduce((sum, item) => sum + (item.verifiedMinutes ?? 0), 0);
  const allVerified = sessions.every((item) => item.status === "verified");
  const incomplete = sessions.some((item) => !item.timeOutAt || item.status === "incomplete");
  return {
    timeIn: sessions.map((item) => formatClock(item.timeInAt)).join(" / "),
    timeOut: sessions.map((item) => formatClock(item.timeOutAt)).join(" / "),
    recorded: sessions.some((item) => item.recordedMinutes != null)
      ? formatMinutes(recorded)
      : "-",
    verified: sessions.some((item) => item.verifiedMinutes != null)
      ? formatMinutes(verified)
      : "-",
    status: allVerified ? "Verified" : incomplete ? "Incomplete" : statusLabel(sessions.at(-1)?.status ?? "pending"),
    remarks: sessions
      .map((item) => item.verificationRemarks)
      .filter((value): value is string => Boolean(value?.trim()))
      .join("; "),
  };
}

export async function generateMonthlyDtrPdf(
  snapshot: MonthlyDtrSnapshot,
  assets: ReportAssets,
): Promise<Uint8Array> {
  validateMonthlyDtrSnapshot(snapshot);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const body = await pdf.embedFont(assets.font, { subset: true });
  const seal = await pdf.embedPng(assets.seal);
  const page = pdf.addPage([595.28, 841.89]);
  const navy = rgb(23 / 255, 33 / 255, 60 / 255);
  const blue = rgb(48 / 255, 73 / 255, 184 / 255);
  const slate = rgb(83 / 255, 98 / 255, 124 / 255);
  const border = rgb(220 / 255, 227 / 255, 239 / 255);
  const pale = rgb(245 / 255, 247 / 255, 251 / 255);
  const success = rgb(8 / 255, 127 / 255, 112 / 255);
  const warning = rgb(149 / 255, 105 / 255, 22 / 255);

  pdf.setTitle(`${snapshot.reportReference} - Monthly Digital DTR`);
  pdf.setAuthor("Partido State University - PRAXIZ");
  pdf.setSubject("PRAXIZ Monthly Digital Daily Time Record");
  const stableTimestamp = new Date(snapshot.finalizedAt ?? snapshot.generatedAt);
  pdf.setCreationDate(stableTimestamp);
  pdf.setModificationDate(stableTimestamp);

  function draw(value: string, x: number, y: number, size = 8, color = navy) {
    page.drawText(value, { x, y, size, font: body, color });
  }
  function line(x1: number, y1: number, x2: number, y2: number, color = border, thickness = 0.7) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
  }
  function labelValue(label: string, value: string, x: number, y: number, width: number, valueSize = 8.2) {
    draw(label.toUpperCase(), x, y, 6.4, slate);
    draw(fitText(value || "Not recorded", body, valueSize, width), x, y - 12, valueSize, navy);
  }

  page.drawImage(seal, { x: 30, y: 761, width: 48, height: 48 });
  draw("Republic of the Philippines", 91, 799, 7.2, slate);
  draw("PARTIDO STATE UNIVERSITY", 91, 783, 13, navy);
  draw("PRAXIZ Internship Monitoring System", 91, 769, 8.4, blue);
  draw("MONTHLY DIGITAL DAILY TIME RECORD", 330, 786, 10.5, navy);
  draw(
    snapshot.verificationStatus === "verified" ? "HTE-VERIFIED" : "PROVISIONAL - NOT YET VERIFIED",
    330,
    770,
    7.2,
    snapshot.verificationStatus === "verified" ? success : warning,
  );
  line(30, 752, 565, 752, blue, 1.2);

  const monthLabel = new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${snapshot.reportingMonth}T00:00:00Z`));
  labelValue("Student", snapshot.student.name, 30, 733, 250);
  labelValue("Student number", snapshot.student.studentNumber, 300, 733, 120);
  labelValue("Month", monthLabel, 438, 733, 127);
  labelValue("Campus", snapshot.student.campus, 30, 697, 130);
  labelValue("Academic unit", snapshot.student.academicUnit, 178, 697, 135);
  labelValue("Program / Section", [snapshot.student.program, snapshot.student.section].filter(Boolean).join(" - "), 331, 697, 234, 7.1);
  labelValue("Host Training Establishment", snapshot.internship.hte, 30, 661, 250);
  labelValue("Academic term", [snapshot.internship.academicYear, snapshot.internship.academicTerm].filter(Boolean).join(" - "), 300, 661, 160);
  labelValue(
    "Scheduled hours",
    snapshot.internship.dailyRequiredHours == null
      ? "Not configured"
      : `${snapshot.internship.dailyRequiredHours} hours/day`,
    478,
    661,
    87,
  );

  const tableX = 30;
  const tableTop = 625;
  const headerHeight = 29;
  const rowHeight = 13.1;
  const columns = [
    { label: "Day", width: 25 },
    { label: "Time In", width: 69 },
    { label: "Time Out", width: 69 },
    { label: "Recorded", width: 58 },
    { label: "Verified", width: 58 },
    { label: "Status", width: 72 },
    { label: "Remarks / Exception", width: 184 },
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  page.drawRectangle({ x: tableX, y: tableTop - headerHeight, width: tableWidth, height: headerHeight, color: pale, borderColor: border, borderWidth: 0.7 });
  let cursorX = tableX;
  for (const column of columns) {
    draw(column.label, cursorX + 4, tableTop - 18, 6.7, navy);
    cursorX += column.width;
    line(cursorX, tableTop, cursorX, tableTop - headerHeight - daysInReportingMonth(snapshot.reportingMonth) * rowHeight);
  }

  const sessionsByDay = new Map<number, MonthlyDtrSessionSnapshot[]>();
  for (const session of snapshot.sessions) {
    const day = Number(session.workDate.slice(-2));
    sessionsByDay.set(day, [...(sessionsByDay.get(day) ?? []), session]);
  }
  const numberOfDays = daysInReportingMonth(snapshot.reportingMonth);
  for (let day = 1; day <= numberOfDays; day += 1) {
    const top = tableTop - headerHeight - (day - 1) * rowHeight;
    const bottom = top - rowHeight;
    if (day % 2 === 0) page.drawRectangle({ x: tableX, y: bottom, width: tableWidth, height: rowHeight, color: rgb(250 / 255, 251 / 255, 254 / 255) });
    const summary = daySummary(sessionsByDay.get(day) ?? []);
    const values = [String(day), summary.timeIn, summary.timeOut, summary.recorded, summary.verified, summary.status, summary.remarks];
    let x = tableX;
    values.forEach((value, index) => {
      const available = columns[index].width - 8;
      draw(fitText(value, body, 6.4, available), x + 4, bottom + 4, 6.4, index === 5 && value === "Verified" ? success : slate);
      x += columns[index].width;
    });
    line(tableX, bottom, tableX + tableWidth, bottom);
  }
  const tableBottom = tableTop - headerHeight - numberOfDays * rowHeight;
  line(tableX, tableTop, tableX + tableWidth, tableTop, blue, 1);
  line(tableX, tableBottom, tableX + tableWidth, tableBottom, blue, 1);
  line(tableX, tableTop, tableX, tableBottom);

  const totalY = tableBottom - 18;
  draw("MONTHLY TOTALS", 30, totalY, 7.2, navy);
  draw(`Recorded ${formatMinutes(snapshot.totals.recordedMinutes)}`, 127, totalY, 7.2, slate);
  draw(`Verified ${formatMinutes(snapshot.totals.verifiedMinutes)}`, 256, totalY, 7.2, success);
  draw(`${snapshot.totals.verifiedSessions}/${snapshot.totals.recordedSessions} sessions verified`, 380, totalY, 7.2, slate);
  draw(`${snapshot.totals.exceptionCount} exception${snapshot.totals.exceptionCount === 1 ? "" : "s"}`, 496, totalY, 7.2, snapshot.totals.exceptionCount ? warning : success);

  const certificationY = totalY - 30;
  line(30, certificationY + 16, 565, certificationY + 16, border);
  if (snapshot.verificationStatus === "verified") {
    draw("SYSTEM-GENERATED HTE VERIFICATION", 30, certificationY, 7, success);
    draw(
      fitText(
        `Finalized by ${snapshot.finalizedBy ?? "Authorized HTE Representative"} on ${formatDateTime(snapshot.finalizedAt)}.`,
        body,
        7.4,
        535,
      ),
      30,
      certificationY - 13,
      7.4,
      navy,
    );
    draw("PRAXIZ records this verification electronically; no handwritten or cryptographic signature is represented.", 30, certificationY - 26, 6.7, slate);
  } else {
    draw("PROVISIONAL REPORT", 30, certificationY, 7, warning);
    draw("This read-only report reflects recorded attendance at generation time and is not yet an HTE-verified monthly DTR.", 30, certificationY - 13, 6.9, slate);
  }
  draw(`Reference ${snapshot.reportReference} - Version ${snapshot.version}`, 30, 37, 6.8, navy);
  draw(`Generated ${formatDateTime(snapshot.generatedAt)} - Asia/Manila`, 30, 25, 6.5, slate);
  draw("Adapted PRAXIZ monthly record - not represented as an officially approved CSC Form 48.", 272, 25, 6.2, slate);

  if (snapshot.verificationStatus !== "verified") {
    page.drawText("PROVISIONAL", {
      x: 128,
      y: 390,
      size: 54,
      font: body,
      color: warning,
      opacity: 0.08,
      rotate: degrees(34),
    });
  }
  return pdf.save();
}

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

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

type ReportAssets = { form: Uint8Array };

type FormDay = {
  amArrival: string;
  amDeparture: string;
  pmArrival: string;
  pmDeparture: string;
  undertimeHours: string;
  undertimeMinutes: string;
  undertimeTotal: number;
};

function assertIsoDate(value: string, label: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new Error(`${label} must be an ISO date.`);
  }
}

export function daysInReportingMonth(reportingMonth: string) {
  assertIsoDate(reportingMonth, "Reporting month");
  const [year, month, day] = reportingMonth.split("-").map(Number);
  if (day !== 1)
    throw new Error(
      "Reporting month must be the first day of a calendar month.",
    );
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
    if (
      !session.sessionId ||
      !session.workDate.startsWith(prefix) ||
      day < 1 ||
      day > dayCount
    ) {
      throw new Error(
        "The monthly DTR contains an attendance session outside its reporting month.",
      );
    }
    for (const minutes of [session.recordedMinutes, session.verifiedMinutes]) {
      if (
        minutes != null &&
        (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60)
      ) {
        throw new Error("The monthly DTR contains invalid attendance minutes.");
      }
    }
  }
}

function manilaClock(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;
  if (!hour || !minute || (dayPeriod !== "AM" && dayPeriod !== "PM")) return null;
  return { value: `${hour}:${minute}`, period: dayPeriod } as const;
}

export function dailyFormValues(
  sessions: MonthlyDtrSessionSnapshot[],
  dailyRequiredHours: number | null,
): FormDay {
  const values = {
    amArrival: [] as string[],
    amDeparture: [] as string[],
    pmArrival: [] as string[],
    pmDeparture: [] as string[],
  };
  let workedMinutes = 0;
  let completeVerifiedDay = sessions.length > 0;
  for (const session of [...sessions].sort((a, b) =>
    (a.timeInAt ?? "").localeCompare(b.timeInAt ?? ""),
  )) {
    const arrival = manilaClock(session.timeInAt);
    const departureDate = session.timeOutAt
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(session.timeOutAt))
      : null;
    // A next-day departure cannot truthfully occupy this day's departure cell.
    const departure = departureDate === session.workDate ? manilaClock(session.timeOutAt) : null;
    if (arrival)
      values[arrival.period === "AM" ? "amArrival" : "pmArrival"].push(
        arrival.value,
      );
    if (departure)
      values[departure.period === "AM" ? "amDeparture" : "pmDeparture"].push(
        departure.value,
      );
    if (session.status !== "verified" || session.verifiedMinutes == null || !arrival || !departure)
      completeVerifiedDay = false;
    workedMinutes += session.verifiedMinutes ?? 0;
  }
  const requiredMinutes =
    dailyRequiredHours != null &&
    Number.isFinite(dailyRequiredHours) &&
    dailyRequiredHours > 0
      ? Math.round(dailyRequiredHours * 60)
      : null;
  const undertime =
    completeVerifiedDay && requiredMinutes != null
      ? Math.max(0, requiredMinutes - workedMinutes)
      : 0;
  return {
    amArrival: values.amArrival.join("/"),
    amDeparture: values.amDeparture.join("/"),
    pmArrival: values.pmArrival.join("/"),
    pmDeparture: values.pmDeparture.join("/"),
    undertimeHours: undertime ? String(Math.floor(undertime / 60)) : "",
    undertimeMinutes: undertime ? String(undertime % 60) : "",
    undertimeTotal: undertime,
  };
}

function fitText(value: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let result = value;
  while (result && font.widthOfTextAtSize(`${result}...`, size) > width) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function drawCentered(
  page: PDFPage,
  value: string,
  font: PDFFont,
  size: number,
  left: number,
  right: number,
  y: number,
) {
  const fitted = fitText(value, font, size, right - left);
  const width = font.widthOfTextAtSize(fitted, size);
  page.drawText(fitted, {
    x: left + Math.max(0, (right - left - width) / 2),
    y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

export async function generateMonthlyDtrPdf(
  snapshot: MonthlyDtrSnapshot,
  assets: ReportAssets,
): Promise<Uint8Array> {
  validateMonthlyDtrSnapshot(snapshot);
  const source = await PDFDocument.load(assets.form);
  const sourcePage = source.getPage(0);
  const { width: sourceWidth, height: sourceHeight } = sourcePage.getSize();
  const formWidth = sourceWidth / 2;

  const pdf = await PDFDocument.create();
  const template = await pdf.embedPage(sourcePage, {
    left: 0,
    bottom: 0,
    right: formWidth,
    top: sourceHeight,
  });
  const page = pdf.addPage([formWidth, sourceHeight]);
  page.drawPage(template, {
    x: 0,
    y: 0,
    width: formWidth,
    height: sourceHeight,
  });

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [year, month] = snapshot.reportingMonth.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  drawCentered(page, snapshot.student.name, bold, 8.4, 68, 281, 864);
  drawCentered(page, monthLabel, font, 8, 102, 208, 833);
  // Original form already prints the century prefix "20".
  drawCentered(page, String(year).slice(-2), font, 8, 229, 275, 833);

  const sessionsByDay = new Map<number, MonthlyDtrSessionSnapshot[]>();
  for (const session of snapshot.sessions) {
    const day = Number(session.workDate.slice(-2));
    sessionsByDay.set(day, [...(sessionsByDay.get(day) ?? []), session]);
  }

  const columns = [
    { key: "amArrival", left: 52, right: 88 },
    { key: "amDeparture", left: 89, right: 126 },
    { key: "pmArrival", left: 130, right: 166 },
    { key: "pmDeparture", left: 168, right: 204 },
    { key: "undertimeHours", left: 209, right: 244 },
    { key: "undertimeMinutes", left: 245, right: 280 },
  ] as const;
  const rowStartY = 727.5;
  const rowHeight = 14.4;
  let totalUndertime = 0;
  for (
    let day = 1;
    day <= daysInReportingMonth(snapshot.reportingMonth);
    day += 1
  ) {
    const values = dailyFormValues(
      sessionsByDay.get(day) ?? [],
      snapshot.internship.dailyRequiredHours,
    );
    totalUndertime += values.undertimeTotal;
    for (const column of columns) {
      const value = values[column.key];
      if (!value) continue;
      drawCentered(
        page,
        value,
        font,
        column.key.startsWith("undertime") ? 5.8 : 5.5,
        column.left,
        column.right,
        rowStartY - (day - 1) * rowHeight,
      );
    }
  }

  if (totalUndertime > 0) {
    drawCentered(
      page,
      String(Math.floor(totalUndertime / 60)),
      bold,
      6.2,
      209,
      244,
      278,
    );
    drawCentered(
      page,
      String(totalUndertime % 60),
      bold,
      6.2,
      245,
      280,
      278,
    );
  }

  pdf.setTitle(`Civil Service Form No. 48 - ${snapshot.student.name}`);
  pdf.setAuthor("Partido State University - PRAXIZ");
  pdf.setSubject(`Daily Time Record for ${monthLabel} ${year}`);
  pdf.setKeywords([
    "Civil Service Form No. 48",
    "Daily Time Record",
    snapshot.reportReference,
  ]);
  const stableTimestamp = new Date(snapshot.finalizedAt ?? snapshot.generatedAt);
  pdf.setCreationDate(stableTimestamp);
  pdf.setModificationDate(stableTimestamp);

  return pdf.save({ useObjectStreams: false });
}

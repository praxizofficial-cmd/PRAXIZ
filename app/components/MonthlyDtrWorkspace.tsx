"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileClock,
  LoaderCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import type { MonthlyDtrSnapshot } from "../../lib/monthly-dtr-report";
import { userError } from "../../lib/user-error";
import type { RoleId } from "../types";
import {
  monthlyDtrService,
  type MonthlyDtrAssignmentOption,
} from "../services/monthly-dtr-service";
import { Dialog } from "./Dialog";
import { StatusBadge } from "./StatusBadge";

function currentMonthInManila() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

function labelStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function ReportSummary({ report }: { report: MonthlyDtrSnapshot }) {
  return (
    <div className="monthly-dtr-summary" aria-label="Monthly DTR summary">
      <div>
        <span>Report reference</span>
        <strong>{report.reportReference}</strong>
        <small>Version {report.version}</small>
      </div>
      <div>
        <span>Verification</span>
        <StatusBadge status={labelStatus(report.verificationStatus)} />
        <small>{report.totals.verifiedSessions} of {report.totals.recordedSessions} sessions verified</small>
      </div>
      <div>
        <span>Verified hours</span>
        <strong>{formatMinutes(report.totals.verifiedMinutes)}</strong>
        <small>{formatMinutes(report.totals.recordedMinutes)} recorded</small>
      </div>
      <div>
        <span>Submission</span>
        <StatusBadge status={labelStatus(report.submissionStatus)} />
        <small>{report.totals.exceptionCount} unresolved exception{report.totals.exceptionCount === 1 ? "" : "s"}</small>
      </div>
    </div>
  );
}

export function MonthlyDtrWorkspace({ role }: { role: RoleId }) {
  const student = role === "student";
  const hte = role === "hte";
  const coordinator = role === "coordinator";
  const [month, setMonth] = useState(currentMonthInManila);
  const [assignments, setAssignments] = useState<MonthlyDtrAssignmentOption[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [report, setReport] = useState<MonthlyDtrSnapshot | null>(null);
  const [reports, setReports] = useState<MonthlyDtrSnapshot[]>([]);
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<"finalize" | "submit" | null>(null);

  const selected = useMemo(
    () => assignments.find((item) => item.assignmentId === selectedAssignment),
    [assignments, selectedAssignment],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (coordinator || role === "admin") {
        setReports(await monthlyDtrService.list(month));
        return;
      }
      const nextAssignments = await monthlyDtrService.listAssignments();
      setAssignments(nextAssignments);
      setSelectedAssignment((current) =>
        nextAssignments.some((item) => item.assignmentId === current)
          ? current
          : (nextAssignments[0]?.assignmentId ?? ""),
      );
      if (!nextAssignments.length) setReport(null);
    } catch (reason) {
      setError(userError(reason, "Monthly DTR records could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [coordinator, month, role]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function prepare() {
    if (!selectedAssignment) {
      setError("No authorized internship assignment is available for this monthly DTR.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await monthlyDtrService.prepare(selectedAssignment, month);
      setReport(next);
      setNotice(next.verificationStatus === "verified"
        ? "The finalized monthly DTR was loaded without changing its frozen attendance snapshot."
        : "The provisional monthly DTR was prepared from the latest authorized attendance records.");
    } catch (reason) {
      setError(userError(reason, "The monthly DTR could not be prepared."));
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!report || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await monthlyDtrService.finalize(report.reportId, remarks);
      setReport(next);
      setNotice("Monthly DTR finalized. This report version now uses a frozen HTE-verified attendance snapshot.");
    } catch (reason) {
      setError(userError(reason, "The monthly DTR could not be finalized."));
    } finally {
      setBusy(false);
    }
  }

  async function requestCorrection() {
    if (!report || busy) return;
    if (!remarks.trim()) {
      setError("Enter correction feedback before returning this monthly DTR.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await monthlyDtrService.requestCorrection(report.reportId, remarks);
      setReport(next);
      setNotice("Correction feedback was recorded without changing any attendance timestamps.");
    } catch (reason) {
      setError(userError(reason, "Correction feedback could not be recorded."));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!report || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await monthlyDtrService.submit(report.reportId);
      setReport(await monthlyDtrService.get(report.reportId));
      setNotice(result.created
        ? "Monthly DTR successfully submitted to the authorized Internship Coordinator."
        : `This verified monthly DTR was already submitted by the ${result.submittedByRole}. The original submission was preserved.`);
    } catch (reason) {
      setError(userError(reason, "The monthly DTR could not be submitted."));
    } finally {
      setBusy(false);
    }
  }

  const heading = student
    ? "My Digital DTR"
    : hte
      ? "Monthly DTR verification"
      : "DTR submissions";
  const description = student
    ? "Preview or download a read-only monthly attendance report assembled from your protected PRAXIZ records."
    : hte
      ? "Review assigned attendance at your schedule, then explicitly finalize the monthly HTE-verified report. Weekly review is optional."
      : "Monitor monthly DTR verification and submission without adding a second routine approval.";

  return (
    <section className="card monthly-dtr-workspace" aria-labelledby="monthly-dtr-heading">
      <div className="card-title monthly-dtr-heading">
        <div>
          <span className="eyebrow dark">Monthly attendance document</span>
          <h2 id="monthly-dtr-heading">{heading}</h2>
          <p>{description}</p>
        </div>
        <FileClock aria-hidden="true" />
      </div>

      <div className="monthly-dtr-controls">
        {!coordinator && role !== "admin" && (
          <label className="field">
            <span>{student ? "Internship assignment" : "Assigned intern"}</span>
            <select
              value={selectedAssignment}
              onChange={(event) => {
                setSelectedAssignment(event.target.value);
                setReport(null);
              }}
              disabled={loading || assignments.length <= 1}
            >
              {!assignments.length && <option value="">No authorized assignment</option>}
              {assignments.map((item) => (
                <option key={item.assignmentId} value={item.assignmentId}>
                  {item.studentName} - {item.hteName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Reporting month</span>
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setReport(null);
            }}
          />
        </label>
        <button
          type="button"
          className="button button-secondary"
          disabled={loading || busy || (!selectedAssignment && !coordinator && role !== "admin")}
          onClick={() => void (coordinator || role === "admin" ? load() : prepare())}
        >
          {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          {coordinator || role === "admin" ? "Refresh submissions" : report ? "Refresh report" : "Prepare report"}
        </button>
      </div>

      {loading && (
        <p className="monthly-dtr-state" role="status">
          <LoaderCircle className="spin" aria-hidden="true" /> Loading authorized monthly DTR records…
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          <AlertTriangle aria-hidden="true" /> {error}
        </p>
      )}
      {notice && (
        <p className="inline-success" role="status">
          <CheckCircle2 aria-hidden="true" /> {notice}
        </p>
      )}

      {(coordinator || role === "admin") && !loading && (
        <div className="record-list monthly-dtr-inbox">{reports.map(item => <details className="record-card" key={item.reportId}><summary><div><strong>{item.student.name}</strong><p>{item.reportingMonth.slice(0,7)} · {item.internship.hte}</p></div><StatusBadge status={labelStatus(item.submissionStatus)}/></summary><dl className="info-list"><div><dt>Student number</dt><dd>{item.student.studentNumber}</dd></div><div><dt>Reference</dt><dd>{item.reportReference}</dd></div><div><dt>Version</dt><dd>{item.version}</dd></div><div><dt>Verification</dt><dd><StatusBadge status={labelStatus(item.verificationStatus)}/></dd></div></dl><div className="table-action-group"><a className="button button-secondary" href={`/api/dtr/${item.reportId}/pdf`} target="_blank" rel="noreferrer"><Eye aria-hidden="true"/> View</a><a className="button button-secondary" href={`/api/dtr/${item.reportId}/pdf?download=1`}><Download aria-hidden="true"/> Download</a></div></details>)}{!reports.length && <p>No authorized monthly DTR records match this reporting month.</p>}</div>
      )}

      {!coordinator && role !== "admin" && !loading && !report && (
        <div className="monthly-dtr-empty">
          <FileClock aria-hidden="true" />
          <strong>{assignments.length ? "Prepare a monthly DTR" : "No internship assignment available"}</strong>
          <p>{assignments.length
            ? "Choose the reporting month and prepare one narrow, read-only Civil Service Form No. 48 front. Only recorded attendance is placed in the PDF; unsupported fields and signatures remain blank."
            : "An active or completed assignment in your authorized scope is required before a monthly DTR can be prepared."}</p>
        </div>
      )}

      {report && !coordinator && role !== "admin" && (
        <div className="monthly-dtr-document">
          <ReportSummary report={report} />
          {selected && (
            <p className="monthly-dtr-context">
              <strong>{selected.studentName}</strong> · {selected.programName} · {selected.hteName}
            </p>
          )}
          {report.verificationRemarks && (
            <div className="monthly-dtr-remarks">
              <strong>Verification remarks</strong>
              <p>{report.verificationRemarks}</p>
            </div>
          )}
          <div className="monthly-dtr-preview">
            <iframe
              title={`${report.reportReference} PDF preview`}
              src={`/api/dtr/${report.reportId}/pdf`}
            />
          </div>
          <div className="monthly-dtr-actions">
            <a className="button button-secondary" href={`/api/dtr/${report.reportId}/pdf`} target="_blank" rel="noreferrer">
              <Eye aria-hidden="true" /> Open preview
            </a>
            <a className="button button-secondary" href={`/api/dtr/${report.reportId}/pdf?download=1`}>
              <Download aria-hidden="true" /> Download PDF
            </a>
            {(student || hte) && report.verificationStatus === "verified" && (
              <button
                className="button button-primary"
                type="button"
                disabled={busy}
                onClick={() => report.submissionStatus === "submitted"
                  ? void submit()
                  : setConfirmation("submit")}
              >
                <Send aria-hidden="true" />
                {report.submissionStatus === "submitted" ? "Check submission" : "Submit to Coordinator"}
              </button>
            )}
          </div>

          {hte && report.verificationStatus !== "verified" && (
            <div className="monthly-dtr-review">
              <label className="field">
                <span>HTE verification remarks</span>
                <textarea
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Optional when finalizing; required when requesting a correction."
                />
              </label>
              <div className="monthly-dtr-review-actions">
                <button className="button button-secondary" type="button" disabled={busy} onClick={() => void requestCorrection()}>
                  Request correction
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={busy || report.totals.exceptionCount > 0 || report.totals.recordedSessions === 0}
                  onClick={() => setConfirmation("finalize")}
                >
                  Finalize verified DTR
                </button>
              </div>
              {(report.totals.exceptionCount > 0 || report.totals.recordedSessions === 0) && (
                <p className="field-hint">Every recorded session must contain a complete authoritative pair and HTE verification before finalization.</p>
              )}
            </div>
          )}
        </div>
      )}

      {confirmation && report && (
        <Dialog
          title={confirmation === "finalize" ? "Finalize monthly DTR?" : "Submit monthly DTR?"}
          onClose={() => setConfirmation(null)}
          busy={busy}
          protectChanges={false}
        >
          <div className="monthly-dtr-confirmation">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>
                {confirmation === "finalize"
                  ? "Confirm the frozen HTE-verified attendance record."
                  : "Confirm delivery to the authorized Internship Coordinator."}
              </strong>
              <p>
                {confirmation === "finalize"
                  ? "Finalizing freezes this report version. Any later attendance correction must create a new version with a complete audit trail."
                  : `${report.reportReference}, version ${report.version}, will be submitted once. A repeated submission will preserve the original sender and timestamp.`}
              </p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={busy}
              onClick={() => {
                const action = confirmation;
                setConfirmation(null);
                void (action === "finalize" ? finalize() : submit());
              }}
            >
              {confirmation === "finalize" ? "Finalize verified DTR" : "Submit to Coordinator"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Download,
  Eye,
  History,
  LoaderCircle,
  Search,
  Plus,
  Undo2,
  Upload,
  UsersRound,
} from "lucide-react";
import { userError } from "../../lib/user-error";
import {
  placementService,
  type PlacementComplianceRecord,
  type PlacementRecord,
  type RequiredFormatRecord,
} from "../services/placement-service";
import { Dialog } from "./Dialog";
import { StatusBadge } from "./StatusBadge";
import { AIInsightsPanel, useAIInsights } from "./AIInsightsPanel";

function WorkspaceHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

function formatDate(value: string) {
  return value
    ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "Not set";
}

function LoadingOrError({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry?: () => void;
}) {
  if (loading)
    return (
      <p role="status" className="table-empty">
        Loading verified PRAXIZ records…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="table-error-state">
        <span>{error}</span>
        {onRetry && <button className="button button-secondary button-small" onClick={onRetry}>Retry</button>}
      </div>
    );
  return null;
}

function PlacementDashboard() {
  const [placements, setPlacements] = useState<PlacementRecord[]>([]);
  const [compliance, setCompliance] = useState<PlacementComplianceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campus, setCampus] = useState("All");
  const [college, setCollege] = useState("All");
  const [term, setTerm] = useState("All");
  useEffect(() => {
    let active = true;
    Promise.all([
      placementService.listPlacements(),
      placementService.listCompliance(),
    ])
      .then(([nextPlacements, nextCompliance]) => {
        if (active) {
          setPlacements(nextPlacements);
          setCompliance(nextCompliance);
        }
      })
      .catch(
        (reason) =>
          active &&
          setError(userError(reason, "Placement data could not be loaded.")),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);
  const filteredPlacements = placements.filter(
    (item) =>
      (campus === "All" || item.campus === campus) &&
      (college === "All" || item.college === college) &&
      (term === "All" || item.term === term),
  );
  const campuses = new Set(filteredPlacements.map((item) => item.campus)).size;
  const colleges = new Set(filteredPlacements.map((item) => item.college)).size;
  const missingRecords = compliance.filter((item) =>
    ["Missing", "Needs Resubmission"].includes(item.status),
  );
  return (
    <>
      <WorkspaceHeader
        title="Placement oversight"
        subtitle="Institution-wide internship placement and compliance records in your authorized scope."
      />
      <LoadingOrError loading={loading} error={error} />
      {!loading && !error && (
        <div className="placement-dashboard-content">
          <section className="card placement-filters" aria-label="Institutional placement filters">
            <label className="field"><span>Campus</span><select value={campus} onChange={(event) => { setCampus(event.target.value); setCollege("All"); }}><option>All</option>{[...new Set(placements.map((item) => item.campus))].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span>College</span><select value={college} onChange={(event) => setCollege(event.target.value)}><option>All</option>{[...new Set(placements.filter((item) => campus === "All" || item.campus === campus).map((item) => item.college))].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span>Academic term</span><select value={term} onChange={(event) => setTerm(event.target.value)}><option>All</option>{[...new Set(placements.map((item) => item.term))].map((value) => <option key={value}>{value}</option>)}</select></label>
          </section>
          <section
            className="placement-summary-grid"
            aria-label="Placement overview"
          >
            <article className="card">
              <UsersRound />
              <span>Assigned interns</span>
              <strong>{filteredPlacements.length}</strong>
            </article>
            <article className="card">
              <FileCheck2 />
              <span>Campuses / colleges</span>
              <strong>
                {campuses} / {colleges}
              </strong>
            </article>
            <article className="card">
              <FileText />
              <span>Compliance needing action</span>
              <strong>{missingRecords.length}</strong>
            </article>
          </section>
          <section className="card placement-hierarchy">
            <div className="card-title">
              <div>
                <h2>Institutional placement hierarchy</h2>
                <p>
                  Expand a campus to inspect its colleges and assigned interns.
                </p>
              </div>
            </div>
            {[...new Set(filteredPlacements.map((item) => item.campus))].map(
              (campus) => {
                const campusRows = filteredPlacements.filter(
                  (item) => item.campus === campus,
                );
                return (
                  <details key={campus}>
                    <summary>
                      <b>{campus}</b>
                      <span>
                        {campusRows.length} intern
                        {campusRows.length === 1 ? "" : "s"}
                      </span>
                    </summary>
                    {[...new Set(campusRows.map((item) => item.college))].map(
                      (college) => {
                        const collegeRows = campusRows.filter(
                          (item) => item.college === college,
                        );
                        return (
                          <div className="hierarchy-row" key={college}>
                            <span>{college}</span>
                            <span>{collegeRows.length} assigned</span>
                          </div>
                        );
                      },
                    )}
                  </details>
                );
              },
            )}
            {!filteredPlacements.length && (
              <p className="table-empty">
                No internship assignments match the selected institutional filters.
              </p>
            )}
          </section>
          <section className="card table-card">
            <div className="card-title"><div><h2>Requires your attention</h2><p>Missing and returned coordinator compliance records.</p></div></div>
            {missingRecords.length ? (
              <div className="table-scroll"><table className="data-table"><thead><tr><th>Requirement</th><th>Coordinator</th><th>Status</th><th>Due date</th></tr></thead><tbody>{missingRecords.slice(0, 5).map((item, index) => <tr key={`${item.requirementId}-${item.submissionId ?? index}`}><td><b>{item.title}</b></td><td>{item.coordinatorName}</td><td><StatusBadge status={item.status} /></td><td>{formatDate(item.dueAt)}</td></tr>)}</tbody></table></div>
            ) : <p className="table-empty">No placement compliance records currently require action.</p>}
          </section>
        </div>
      )}
    </>
  );
}

function StudentOverview() {
  const [records, setRecords] = useState<PlacementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState("All");
  const [college, setCollege] = useState("All");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PlacementRecord | null>(null);
  const pageSize = 10;
  useEffect(() => {
    let active = true;
    placementService
      .listPlacements()
      .then((items) => active && setRecords(items))
      .catch(
        (reason) =>
          active &&
          setError(
            userError(reason, "Student placements could not be loaded."),
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);
  const shown = useMemo(
    () =>
      records.filter((item) => {
        const haystack = [
          item.studentName,
          item.coordinator,
          item.program,
          item.hte,
          item.section,
          item.term,
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!search || haystack.includes(search.toLowerCase())) &&
          (campus === "All" || item.campus === campus) &&
          (college === "All" || item.college === college) &&
          (status === "All" || item.status === status)
        );
      }),
    [records, search, campus, college, status],
  );
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const visibleRows = shown.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      <WorkspaceHeader
        title="Student / internship overview"
        subtitle="Filter real assignments across the campus, college, coordinator, program, HTE, section, and term hierarchy."
      />
      <section className="card table-card">
        <div className="card-title">
          <div>
            <h2>
              {loading
                ? "Loading student placements…"
                : `${shown.length} student${shown.length === 1 ? "" : "s"}`}
            </h2>
            <p>Only assignments inside your authorized institutional scope are shown.</p>
          </div>
        </div>
        <div className="placement-filters placement-student-filters">
          <label className="field">
            <span>Search</span>
            <div className="search-field">
              <Search size={18} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Student, HTE, program, coordinator…"
              />
            </div>
          </label>
          <label className="field">
            <span>Campus</span>
            <select
              value={campus}
              onChange={(event) => {
                setCampus(event.target.value);
                setPage(1);
              }}
            >
              <option>All</option>
              {[...new Set(records.map((item) => item.campus))].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>College</span>
            <select
              value={college}
              onChange={(event) => {
                setCollege(event.target.value);
                setPage(1);
              }}
            >
              <option>All</option>
              {[...new Set(records.map((item) => item.college))].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option>All</option>
              {[...new Set(records.map((item) => item.status))].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <LoadingOrError loading={loading} error={error} />
        {!loading && !error && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Campus / college</th>
                  <th>Program / section</th>
                  <th>HTE</th>
                  <th>Coordinator</th>
                  <th>Term</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.studentName}</b>
                      {item.yearLevel && <small>Year {item.yearLevel}</small>}
                    </td>
                    <td>
                      {item.campus}
                      <small>{item.college}</small>
                    </td>
                    <td>
                      {item.program}
                      <small>Section {item.section}</small>
                    </td>
                    <td>
                      {item.hte}
                      <small>
                        {item.dailyRequiredHours == null
                          ? "Daily hours not configured"
                          : `${item.dailyRequiredHours} hrs/day`}
                      </small>
                    </td>
                    <td>{item.coordinator}</td>
                    <td>{item.term}</td>
                    <td>
                      <div className="placement-student-status">
                      <StatusBadge status={item.status} />
                      <button
                        className="table-link"
                        onClick={() => setSelected(item)}
                      >
                        View details
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={7}>
                      No assignments match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && shown.length > 0 && (
          <div className="placement-student-pagination" aria-label="Student placement pages">
            <span className="table-page-summary">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, shown.length)} of {shown.length}
            </span>
            <div className="placement-student-page-controls">
            <button
              className="button button-secondary button-small"
              disabled={page === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </button>
            <span aria-live="polite">Page {page} of {pageCount}</span>
            <button
              className="button button-secondary button-small"
              disabled={page === pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Next
            </button>
            </div>
          </div>
        )}
      </section>
      {selected && (
        <Dialog
          title={selected.studentName}
          onClose={() => setSelected(null)}
          protectChanges={false}
        >
          <dl className="profile-details-grid">
            <div><dt>Campus</dt><dd>{selected.campus || "Not recorded"}</dd></div>
            <div><dt>College</dt><dd>{selected.college || "Not recorded"}</dd></div>
            <div><dt>Program</dt><dd>{selected.program || "Not recorded"}</dd></div>
            <div><dt>Year / section</dt><dd>{selected.yearLevel ? `Year ${selected.yearLevel}` : "Year not recorded"} · {selected.section || "Section not recorded"}</dd></div>
            <div><dt>HTE</dt><dd>{selected.hte || "Not assigned"}</dd></div>
            <div><dt>Coordinator</dt><dd>{selected.coordinator || "Not assigned"}</dd></div>
            <div><dt>Academic term</dt><dd>{selected.term || "Not recorded"}</dd></div>
            <div><dt>Daily hours</dt><dd>{selected.dailyRequiredHours == null ? "Not configured" : `${selected.dailyRequiredHours} hours`}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge status={selected.status} /></dd></div>
          </dl>
          <div className="modal-actions">
            <button className="button button-secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function RequirementDialog({
  close,
  saved,
}: {
  close: () => void;
  saved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await placementService.createRequirement({ title, description, dueAt });
      saved();
    } catch (reason) {
      setError(userError(reason, "The requirement could not be created."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Create placement requirement" onClose={close} busy={busy}>
      <form onSubmit={submit}>
        <label className="field">
          <span>Requirement title</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Due date and time</span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            disabled={busy || !title.trim()}
          >
            {busy ? "Creating…" : "Create requirement"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ComplianceDialog({
  record,
  mode,
  close,
  saved,
}: {
  record: PlacementComplianceRecord;
  mode: "submit" | "review";
  close: () => void;
  saved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<"approved" | "needs_resubmission">(
    "approved",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "submit") {
        if (!file)
          throw new Error("Choose the required file before submitting.");
        await placementService.submitCompliance({
          requirementId: record.requirementId,
          file,
          notes,
        });
      } else {
        if (!record.submissionId)
          throw new Error("No submission is available for review.");
        await placementService.reviewSubmission(
          record.submissionId,
          decision,
          notes,
        );
      }
      saved();
    } catch (reason) {
      setError(userError(reason, "This action could not be completed."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        mode === "submit"
          ? `${record.version ? "Resubmit" : "Submit"} ${record.title}`
          : `Review ${record.title}`
      }
      onClose={close}
      busy={busy}
    >
      <form onSubmit={submit}>
        {mode === "submit" ? (
          <>
            <label className="field">
              <span>Document file</span>
              <input
                required
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <small>The requirement owner currently accepts PDF files.</small>
            </label>
            <label className="field">
              <span>Submission notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>Decision</span>
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value as typeof decision)}
              >
                <option value="approved">Approve</option>
                <option value="needs_resubmission">Request resubmission</option>
              </select>
            </label>
            <label className="field">
              <span>Feedback {decision === "needs_resubmission" && "*"}</span>
              <textarea
                required={decision === "needs_resubmission"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={close}
          >
            Cancel
          </button>
          <button
            className={`button ${decision === "needs_resubmission" && mode === "review" ? "button-danger" : "button-primary"}`}
            disabled={
              busy ||
              (mode === "submit" && !file) ||
              (mode === "review" &&
                decision === "needs_resubmission" &&
                !notes.trim())
            }
          >
            {busy
              ? "Saving…"
              : mode === "submit"
                ? "Submit document"
                : decision === "approved"
                  ? "Approve"
                  : "Request resubmission"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ComplianceWorkspace({
  actorRole,
  recordsOnly = false,
}: {
  actorRole: "placement" | "coordinator";
  recordsOnly?: boolean;
}) {
  const [records, setRecords] = useState<PlacementComplianceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{
    record: PlacementComplianceRecord;
    mode: "submit" | "review";
  } | null>(null);
  const [historyRecord, setHistoryRecord] = useState<PlacementComplianceRecord | null>(null);
  const [creating, setCreating] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setRecords(await placementService.listCompliance());
    } catch (reason) {
      setError(
        userError(reason, "Placement compliance records could not be loaded."),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  const shown = records.filter(
    (item) =>
      (status === "All" || item.status === status) &&
      [item.title, item.coordinatorName, item.originalName]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const title = recordsOnly
    ? "Records management"
    : actorRole === "placement"
      ? "Document compliance"
      : "Placement compliance";
  const subtitle = recordsOnly
    ? "Trace submitted versions, review outcomes, and Placement Head feedback without deleting history."
    : actorRole === "placement"
      ? "Set coordinator requirements and review every submitted version."
      : "Submit documents requested by the Placement Head and respond to review feedback.";
  const approved = shown.filter((item) => item.status === "Approved").length;
  const reviewQueue = shown.filter((item) => ["Submitted", "Under Review"].includes(item.status)).length;
  const needsAction = shown.filter((item) => ["Missing", "Needs Resubmission"].includes(item.status)).length;
  return (
    <>
      <WorkspaceHeader title={title} subtitle={subtitle} />
      <div className="stats-grid three placement-compliance-stats">
        <article className="stat-card"><CheckCircle2 aria-hidden="true" /><span>Approved</span><strong>{approved}</strong></article>
        <article className="stat-card"><Clock3 aria-hidden="true" /><span>Awaiting review</span><strong>{reviewQueue}</strong></article>
        <article className="stat-card"><AlertTriangle aria-hidden="true" /><span>Needs action</span><strong>{needsAction}</strong></article>
      </div>
      <section className="card table-card">
        <div className="card-title">
          <div className="placement-filters compact">
            <label className="field">
              <span>Search records</span>
              <div className="search-field-control">
              <Search size={18} aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Requirement, file, coordinator…"
              />
              </div>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option>All</option>
                {[...new Set(records.map((item) => item.status))].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          {actorRole === "placement" && !recordsOnly && (
            <button
              className="button button-primary"
              onClick={() => setCreating(true)}
            >
              <Plus size={18} aria-hidden="true" />
              Create requirement
            </button>
          )}
        </div>
        <LoadingOrError loading={loading} error={error} onRetry={() => void load()} />
        {!loading && !error && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Requirement</th>
                  {actorRole === "placement" && <th>Coordinator</th>}
                  <th>Due date</th>
                  <th>Latest submission</th>
                  <th>Status</th>
                  <th>Feedback</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item, index) => (
                  <tr
                    key={`${item.requirementId}-${item.submissionId ?? index}`}
                  >
                    <td>
                      <b>{item.title}</b>
                      <small>{item.description}</small>
                    </td>
                    {actorRole === "placement" && (
                      <td>{item.coordinatorName}</td>
                    )}
                    <td>{formatDate(item.dueAt)}</td>
                    <td>
                      {item.version ? (
                        <>
                          <b>v{item.version}</b>
                          <small>
                            {item.originalName} · {formatDate(item.submittedAt)}
                          </small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>{item.feedback || "—"}</td>
                    <td>
                      <div className="row-actions">
                        {item.submissionId && (
                          <button
                            className="table-link"
                            onClick={() =>
                              void placementService
                                .complianceDownloadUrl(item.submissionId!)
                                .then((url) =>
                                  window.open(
                                    url,
                                    "_blank",
                                    "noopener,noreferrer",
                                  ),
                                )
                                .catch((reason) =>
                                  setError(
                                    userError(
                                      reason,
                                      "The file could not be opened.",
                                    ),
                                  ),
                                )
                            }
                          >
                            View
                          </button>
                        )}
                        {item.history.length > 0 && (
                          <button className="table-link" onClick={() => setHistoryRecord(item)}>
                            <History size={16} /> History
                          </button>
                        )}
                        {!recordsOnly &&
                          actorRole === "coordinator" &&
                          item.status !== "Approved" && (
                            <button
                              className="table-link"
                              onClick={() =>
                                setDialog({ record: item, mode: "submit" })
                              }
                            >
                              {item.version ? "Resubmit" : "Upload"}
                            </button>
                          )}
                        {!recordsOnly &&
                          actorRole === "placement" &&
                          item.submissionId &&
                          item.status !== "Approved" && (
                            <button
                              className="table-link"
                              onClick={() =>
                                setDialog({ record: item, mode: "review" })
                              }
                            >
                              Review
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={actorRole === "placement" ? 7 : 6}>
                      {records.length
                        ? "No compliance records match this view."
                        : actorRole === "coordinator"
                          ? "No placement compliance requirements are assigned to your authorized scope yet."
                          : "No placement compliance requirements have been created yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating && (
        <RequirementDialog
          close={() => setCreating(false)}
          saved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      {dialog && (
        <ComplianceDialog
          {...dialog}
          close={() => setDialog(null)}
          saved={() => {
            setDialog(null);
            void load();
          }}
        />
      )}
      {historyRecord && (
        <Dialog title={`${historyRecord.title} version history`} onClose={() => setHistoryRecord(null)} protectChanges={false}>
          <div className="version-history-list">
            {historyRecord.history.map((version) => (
              <article key={version.submissionId}>
                <div><strong>Version {version.version}</strong><small>{version.originalName}</small></div>
                <StatusBadge status={version.status} />
                <dl><div><dt>Submitted</dt><dd>{formatDate(version.submittedAt)}</dd></div><div><dt>Feedback</dt><dd>{version.feedback || "No reviewer feedback"}</dd></div></dl>
                <button className="table-link" onClick={() => void placementService.complianceDownloadUrl(version.submissionId).then((url) => window.open(url, "_blank", "noopener,noreferrer")).catch((reason) => setError(userError(reason, "The archived version could not be opened.")))}>View this version</button>
              </article>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

function FormatDialog({
  close,
  saved,
}: {
  close: () => void;
  saved: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await placementService.createFormat({ code, name, description });
      saved();
    } catch (reason) {
      setError(userError(reason, "The file format could not be created."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Add required file format" onClose={close} busy={busy}>
      <form onSubmit={submit}>
        <label className="field">
          <span>Short code</span>
          <input
            required
            maxLength={30}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Document title</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Instructions</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            disabled={busy || !code.trim() || !name.trim()}
          >
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RequiredFormats({ admin = false }: { admin?: boolean }) {
  const [records, setRecords] = useState<RequiredFormatRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [previewing, setPreviewing] = useState<RequiredFormatRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [historyRecord, setHistoryRecord] = useState<RequiredFormatRecord | null>(null);
  const [returning, setReturning] = useState<RequiredFormatRecord | null>(null);
  const [returnFeedback, setReturnFeedback] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setRecords(await placementService.listRequiredFormats());
    } catch (reason) {
      setError(userError(reason, "Required file formats could not be loaded."));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  async function upload(record: RequiredFormatRecord, file?: File) {
    if (!file) return;
    setBusyId(record.id);
    setError("");
    try {
      await placementService.submitFormatVersion(record.id, file);
      await load();
    } catch (reason) {
      setError(userError(reason, "The new version could not be submitted."));
    } finally {
      setBusyId("");
    }
  }
  async function publish(record: RequiredFormatRecord) {
    if (!record.versionId) return;
    setBusyId(record.id);
    setError("");
    try {
      await placementService.publishFormatVersion(record.versionId);
      await load();
    } catch (reason) {
      setError(userError(reason, "The format could not be published."));
    } finally {
      setBusyId("");
    }
  }
  async function preview(record: RequiredFormatRecord) {
    setPreviewing(record);
    setPreviewUrl("");
    setError("");
    try {
      setPreviewUrl(await placementService.requiredFormatUrl(record));
    } catch (reason) {
      setError(userError(reason, "The secure preview could not be opened."));
    }
  }
  async function download(record: RequiredFormatRecord) {
    const popup = window.open("", "_blank");
    if (!popup) {
      setError(
        "Your browser blocked the secure download window. Allow pop-ups for PRAXIZ and try again.",
      );
      return;
    }
    setBusyId(record.id);
    setError("");
    try {
      const url = await placementService.requiredFormatUrl(record, true);
      popup.opener = null;
      popup.location.replace(url);
    } catch (reason) {
      popup.close();
      setError(userError(reason, "The secure download could not be opened."));
    } finally {
      setBusyId("");
    }
  }
  async function returnWithFeedback() {
    if (!returning?.versionId) return;
    setBusyId(returning.id);
    setError("");
    try {
      await placementService.returnFormatVersion(
        returning.versionId,
        returnFeedback,
      );
      setReturning(null);
      setReturnFeedback("");
      await load();
    } catch (reason) {
      setError(userError(reason, "The version could not be returned."));
    } finally {
      setBusyId("");
    }
  }
  return (
    <>
      <WorkspaceHeader
        title={admin ? "Required file distribution" : "Required file formats"}
        subtitle={
          admin
            ? "Review and publish official document templates submitted by Placement Heads."
            : "Create controlled templates and submit versioned files for administrator publication."
        }
      />
      <section className="card table-card">
        <div className="card-title">
          <div>
            <h2>Controlled document library</h2>
            <p>
              Published versions remain traceable; new uploads create a new
              version.
            </p>
          </div>
          {!admin && (
            <button
              className="button button-primary"
              onClick={() => setCreating(true)}
            >
              <Plus size={18} aria-hidden="true" />
              Add format
            </button>
          )}
        </div>
        <LoadingOrError loading={loading} error={error} onRetry={() => void load()} />
        {!loading && !error && (
          <div className="format-grid">
            {records.map((record) => (
              <article className="format-card" key={record.id}>
                <div>
                  <span className="eyebrow">{record.code}</span>
                  <h3>{record.name}</h3>
                  <p>{record.description}</p>
                </div>
                <dl>
                  <div>
                    <dt>Latest file</dt>
                    <dd>{record.fileName}</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>{record.version ? `v${record.version}` : "None"}</dd>
                  </div>
                </dl>
                <div className="row-actions">
                  <StatusBadge status={record.status} />
                  {record.objectPath && (
                    <>
                      <button
                        className="button button-secondary button-small"
                        disabled={busyId === record.id}
                        onClick={() => void preview(record)}
                      >
                        <Eye size={16} /> Preview
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Download ${record.fileName}`}
                        title={`Download ${record.fileName}`}
                        disabled={busyId === record.id}
                        onClick={() => void download(record)}
                      >
                        <Download size={16} />
                      </button>
                    </>
                  )}
                  {record.history.length > 0 && (
                    <button
                      className="button button-secondary button-small"
                      onClick={() => setHistoryRecord(record)}
                    >
                      <History size={16} /> History
                    </button>
                  )}
                  {admin ? (
                    record.versionId && record.status !== "Published" && (
                      <>
                        <button
                          className="button button-secondary button-small"
                          disabled={busyId === record.id}
                          onClick={() => setReturning(record)}
                        >
                          <Undo2 size={16} /> Return with feedback
                        </button>
                        <button
                          className="button button-primary button-small"
                          disabled={busyId === record.id}
                          onClick={() => void publish(record)}
                        >
                          Publish
                        </button>
                      </>
                    )
                  ) : (
                    <label className="button button-secondary button-small">
                      <Upload size={16} />
                      {busyId === record.id ? "Uploading…" : "Submit version"}
                      <input
                        className="visually-hidden"
                        type="file"
                        disabled={busyId === record.id}
                        onChange={(e) =>
                          void upload(record, e.target.files?.[0])
                        }
                      />
                    </label>
                  )}
                </div>
              </article>
            ))}
            {!records.length && (
              <p className="table-empty">
                {admin
                  ? "No required file formats have been submitted by a Placement Head yet."
                  : "No required file formats have been configured yet. Add the first controlled format to begin."}
              </p>
            )}
          </div>
        )}
      </section>
      {creating && (
        <FormatDialog
          close={() => setCreating(false)}
          saved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      {previewing && (
        <Dialog
          title={previewing.name}
          onClose={() => setPreviewing(null)}
          wide
          protectChanges={false}
          className="document-preview-dialog"
        >
          <div className="document-preview-toolbar">
            <p>Previewing <strong>{previewing.fileName}</strong> inside PRAXIZ.</p>
            <button className="icon-button" aria-label={`Download ${previewing.fileName}`} onClick={() => void download(previewing)}><Download size={18} /></button>
          </div>
          {previewUrl ? (
            <iframe className="document-preview-frame" src={previewUrl} title={`Preview ${previewing.fileName}`} />
          ) : (
            <div className="document-preview-loading" role="status"><LoaderCircle className="button-spinner" /> Loading secure preview…</div>
          )}
        </Dialog>
      )}
      {historyRecord && (
        <Dialog title={`${historyRecord.name} version history`} onClose={() => setHistoryRecord(null)} protectChanges={false}>
          <div className="version-history-list">
            {historyRecord.history.map((version) => (
              <article key={version.id}>
                <div><strong>Version {version.version}</strong><small>{version.fileName}</small></div>
                <StatusBadge status={version.status} />
                <dl><div><dt>Submitted by</dt><dd>{version.submittedBy}</dd></div><div><dt>Submitted</dt><dd>{formatDate(version.submittedAt)}</dd></div></dl>
              </article>
            ))}
          </div>
        </Dialog>
      )}
      {returning && (
        <Dialog title={`Return ${returning.name}`} onClose={() => setReturning(null)} busy={busyId === returning.id}>
          <label className="field"><span>Feedback *</span><textarea required value={returnFeedback} onChange={(event) => setReturnFeedback(event.target.value)} placeholder="Explain what the Placement Head must correct…" /></label>
          <div className="modal-actions"><button className="button button-secondary" onClick={() => setReturning(null)}>Cancel</button><button className="button button-primary" disabled={!returnFeedback.trim() || busyId === returning.id} onClick={() => void returnWithFeedback()}>Return version</button></div>
        </Dialog>
      )}
    </>
  );
}

function PlacementAnalytics() {
  const [records, setRecords] = useState<PlacementRecord[]>([]);
  const [scope, setScope] = useState("overall");
  const [target, setTarget] = useState("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const {
    result: insight,
    loading: generating,
    error: aiError,
    retryable: aiRetryable,
    confirmedEmpty: aiConfirmedEmpty,
    generate: requestAiInsights,
    resetForScope: resetAiInsights,
  } = useAIInsights();
  useEffect(() => {
    placementService
      .listPlacements()
      .then(setRecords)
      .catch((reason) =>
        setLoadError(
          userError(reason, "Analytics records could not be loaded."),
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const key: keyof PlacementRecord | null =
    scope === "student"
      ? "studentName"
      : scope === "hte"
        ? "hte"
        : scope === "coordinator"
          ? "coordinator"
          : scope === "section"
            ? "section"
            : null;
  const options = key
    ? [...new Set(records.map((item) => String(item[key] ?? "Not recorded")))]
    : [];
  const shown =
    key && target !== "All"
      ? records.filter((item) => String(item[key] ?? "Not recorded") === target)
      : records;
  const active = shown.filter((item) => item.status === "Active").length;
  const missingHours = shown.filter(
    (item) => item.dailyRequiredHours == null,
  ).length;
  const htes = new Set(shown.map((item) => item.hte)).size;
  async function generateInsight() {
    const selected =
      target === "All"
        ? null
        : records.find(
            (item) => key && String(item[key] ?? "Not recorded") === target,
          );
    const payload: Record<string, string> = { scope };
    if (scope === "student" && selected)
      payload.studentId = selected.studentId;
    if (scope === "hte" && selected) payload.hteId = selected.hteId;
    if (scope === "coordinator" && selected)
      payload.coordinatorId = selected.coordinatorId;
    if (scope === "section" && target !== "All") payload.section = target;
    await requestAiInsights(payload, analyticsScopeKey);
  }
  const analyticsScopeKey = `${scope}:${target}`;
  const analyticsScopeLabel =
    scope === "overall"
      ? "Institution-wide authorized scope"
      : target === "All"
        ? `All authorized ${scope} records`
        : target;
  return (
    <>
      <WorkspaceHeader
        title="AI analytics"
        subtitle="Advisory summaries based only on the verified assignment records visible in your authorized scope."
      />
      <section className="card analytics-scope">
        <div className="placement-filters compact">
          <label className="field">
            <span>Analysis scope</span>
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setTarget("All");
                resetAiInsights();
              }}
            >
              <option value="overall">Overall</option>
              <option value="student">By student</option>
              <option value="hte">By HTE</option>
              <option value="coordinator">By coordinator</option>
              <option value="section">By section</option>
            </select>
          </label>
          {key && (
            <label className="field">
              <span>Target</span>
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  resetAiInsights();
                }}
              >
                <option>All</option>
                {options.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <LoadingOrError loading={loading} error={loadError} />
        {!loading && !loadError && (
          <>
            <div className="placement-summary-grid placement-analytics-summary">
              <article>
                <UsersRound />
                <span>Visible interns</span>
                <strong>{shown.length}</strong>
              </article>
              <article>
                <BarChart3 />
                <span>Active assignments</span>
                <strong>{active}</strong>
              </article>
              <article>
                <FileCheck2 />
                <span>HTEs represented</span>
                <strong>{htes}</strong>
              </article>
            </div>
            <div className="ai-evidence">
              <h2>Verified record summary</h2>
              <p>
                {shown.length
                  ? `${shown.length} authorized assignment${shown.length === 1 ? " is" : "s are"} included. ${active} are active across ${htes} HTE${htes === 1 ? "" : "s"}.`
                  : "No authorized assignment records match this scope."}
              </p>
              {missingHours > 0 && (
                <p>
                  <strong>Notable exception:</strong> {missingHours} assignment
                  {missingHours === 1 ? " has" : "s have"} no snapshotted HTE
                  daily-hours requirement.
                </p>
              )}
            </div>
            <AIInsightsPanel
              result={insight}
              loading={generating}
              error={aiError}
              retryable={aiRetryable}
              confirmedEmpty={aiConfirmedEmpty}
              hasData={shown.length > 0}
              canGenerate={scope === "overall" || target !== "All"}
              scopeKey={analyticsScopeKey}
              scopeLabel={analyticsScopeLabel}
              onGenerate={() => void generateInsight()}
            />
          </>
        )}
      </section>
    </>
  );
}

export function PlacementWorkspace({
  page,
  actorRole,
}: {
  page: string;
  actorRole: "placement" | "coordinator" | "admin";
}) {
  if (page === "dashboard" && actorRole === "placement")
    return <PlacementDashboard />;
  if (page === "students" && actorRole === "placement")
    return <StudentOverview />;
  if (page === "compliance" && actorRole === "placement")
    return <ComplianceWorkspace actorRole="placement" />;
  if (page === "placement-compliance" && actorRole === "coordinator")
    return <ComplianceWorkspace actorRole="coordinator" />;
  if (page === "records" && actorRole === "coordinator")
    return <ComplianceWorkspace actorRole="coordinator" recordsOnly />;
  if (page === "file-formats")
    return <RequiredFormats admin={actorRole === "admin"} />;
  if (page === "analytics" && actorRole === "placement")
    return <PlacementAnalytics />;
  return (
    <p className="table-empty">This placement workspace is not available.</p>
  );
}

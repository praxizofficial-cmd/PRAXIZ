"use client";

import { CheckCircle2, Clock3, LockKeyhole } from "lucide-react";
import type { AcademicTerm } from "../types";
import { StatusBadge } from "./StatusBadge";

type Transition = "active" | "pending_closure" | "finalized";

function formatOfficialDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export function InstitutionalBrowser({
  terms,
  onEditTerm,
  onTransitionTerm,
}: {
  terms: AcademicTerm[];
  onEditTerm?: (term: AcademicTerm) => void;
  onTransitionTerm?: (term: AcademicTerm, next: Transition) => void;
}) {
  return (
    <section className="card table-card academic-term-card">
      <div className="card-title">
        <div>
          <h2>Academic terms</h2>
          <p className="muted-note">
            Administrators control official dates and every lifecycle
            transition. Reaching an end date never finalizes a term
            automatically.
          </p>
        </div>
        <span>{terms.length} terms</span>
      </div>
      <div className="term-lifecycle" aria-label="Academic term lifecycle">
        <span>
          <b>1</b>Draft
        </span>
        <i />
        <span>
          <b>2</b>Active
        </span>
        <i />
        <span>
          <b>3</b>Pending Closure
        </span>
        <i />
        <span>
          <b>4</b>Finalized
        </span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Academic year</th>
              <th>Term</th>
              <th>Official dates</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((term) => (
              <tr key={term.id} className={term.isCurrent ? "current-term-row" : ""}>
                <td>
                  <b>{term.academicYear}</b>
                </td>
                <td>{term.term}</td>
                <td>
                  {formatOfficialDate(term.startsOn)} – {formatOfficialDate(term.endsOn)}
                </td>
                <td>
                  <div className="term-status">
                    <StatusBadge status={term.configurationStatus} />
                    {term.isCurrent && (
                      <span className="badge badge-info">Current</span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="inline-actions">
                    {term.configurationStatus !== "Finalized" && (
                      <button
                        className="table-link"
                        onClick={() => onEditTerm?.(term)}
                      >
                        Edit dates
                      </button>
                    )}
                    {term.configurationStatus === "Draft" && (
                      <button
                        className="table-link"
                        onClick={() => onTransitionTerm?.(term, "active")}
                      >
                        <CheckCircle2 size={16} />
                        Activate
                      </button>
                    )}
                    {term.configurationStatus === "Active" && (
                      <button
                        className="table-link"
                        onClick={() =>
                          onTransitionTerm?.(term, "pending_closure")
                        }
                      >
                        <Clock3 size={16} />
                        Move to Pending Closure
                      </button>
                    )}
                    {term.configurationStatus === "Pending Closure" && (
                      <button
                        className="table-link term-finalize-action"
                        onClick={() => onTransitionTerm?.(term, "finalized")}
                      >
                        <LockKeyhole size={16} />
                        Finalize
                      </button>
                    )}
                    {term.configurationStatus === "Finalized" && (
                      <span className="muted-note">Read-only</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!terms.length && (
              <tr>
                <td colSpan={5}>No academic terms configured.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

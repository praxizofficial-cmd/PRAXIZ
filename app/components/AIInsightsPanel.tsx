"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AnalyticsEvidence } from "../analytics-insights";

export type AIInsightResult = {
  summary: string;
  patterns: string[];
  recommendations: string[];
  evidence?: AnalyticsEvidence;
  risks?: Array<{
    severity: "high" | "medium" | "low";
    indicator: string;
    message: string;
  }>;
  scope?: string;
  model?: string;
  source?: "ollama";
  generatedAt?: string;
  scopeKey: string;
};

type AIRequestState = {
  result: AIInsightResult | null;
  loading: boolean;
  error: string;
  retryable: boolean;
  confirmedEmpty: boolean;
};

const initialRequestState: AIRequestState = {
  result: null,
  loading: false,
  error: "",
  retryable: false,
  confirmedEmpty: false,
};

function safeErrorMessage(status: number, kind?: string, message?: string) {
  if (status === 401)
    return "Your session has expired. Sign in again to generate AI insights.";
  if (status === 403)
    return "You do not have permission to generate insights for this scope.";
  if (kind === "PROVIDER_UNREACHABLE" || kind === "MODEL_UNAVAILABLE")
    return "PRAXIZ AI is temporarily unavailable. Your verified internship records remain available.";
  if (status >= 500)
    return message || "PRAXIZ couldn't complete the AI analysis. Your verified internship records remain available.";
  return message || "PRAXIZ couldn't complete the AI analysis. Your verified internship records remain available.";
}

/** Shared request lifecycle for both authorized analytics workspaces. */
export function useAIInsights() {
  const [state, setState] = useState<AIRequestState>(initialRequestState);
  const requestSequence = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const pending = useRef(false);

  useEffect(
    () => () => {
      requestSequence.current += 1;
      abortController.current?.abort();
    },
    [],
  );

  const resetForScope = useCallback(() => {
    requestSequence.current += 1;
    pending.current = false;
    abortController.current?.abort();
    abortController.current = null;
    setState(initialRequestState);
  }, []);

  const generate = useCallback(
    async (payload: Record<string, string>, scopeKey: string) => {
      if (pending.current) return;
      pending.current = true;
      const sequence = ++requestSequence.current;
      abortController.current?.abort();
      const controller = new AbortController();
      abortController.current = controller;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 45_000);

      setState((current) => ({
        ...current,
        loading: true,
        error: "",
        retryable: false,
        confirmedEmpty: false,
      }));

      try {
        const response = await fetch("/api/ai/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as Partial<
          AIInsightResult
        > & {
          error?: string;
          kind?: string;
          retryable?: boolean;
        };
        if (sequence !== requestSequence.current) return;

        if (!response.ok || !data.summary) {
          const isConfirmedEmpty =
            response.status === 404 && !data.kind && !data.summary;
          setState((current) => ({
            ...current,
            loading: false,
            error: isConfirmedEmpty
              ? ""
              : safeErrorMessage(response.status, data.kind, data.error),
            retryable: Boolean(data.retryable) || response.status >= 500,
            confirmedEmpty: isConfirmedEmpty,
          }));
          return;
        }

        setState({
          result: {
            summary: data.summary,
            patterns: Array.isArray(data.patterns) ? data.patterns : [],
            recommendations: Array.isArray(data.recommendations)
              ? data.recommendations
              : [],
            evidence: data.evidence,
            risks: data.risks,
            scope: data.scope,
            model: data.model,
            source: data.source,
            generatedAt:
              typeof data.generatedAt === "string"
                ? data.generatedAt
                : undefined,
            scopeKey,
          },
          loading: false,
          error: "",
          retryable: false,
          confirmedEmpty: false,
        });
      } catch (reason) {
        if (sequence !== requestSequence.current) return;
        if (controller.signal.aborted && !timedOut) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: timedOut
            ? "PRAXIZ AI took too long to respond. Your verified internship records remain available."
            : reason instanceof TypeError
              ? "The AI service could not be reached. Check your connection and try again."
              : "PRAXIZ couldn't complete the AI analysis. Your verified internship records remain available.",
          retryable: true,
          confirmedEmpty: false,
        }));
      } finally {
        window.clearTimeout(timeoutId);
        if (sequence === requestSequence.current) {
          pending.current = false;
          abortController.current = null;
        }
      }
    },
    [],
  );

  return { ...state, generate, resetForScope };
}

const workflowStages = [
  {
    title: "Preparing verified records",
    copy: "Collecting authorized attendance, weekly log, document, and evaluation indicators.",
  },
  {
    title: "Reviewing performance indicators",
    copy: "Examining completion rates, outstanding requirements, and potential concerns.",
  },
  {
    title: "Generating insights",
    copy: "Preparing observations and recommended follow-up actions.",
  },
];

function AIInsightLoadingState() {
  return (
    <div className="ai-analysis-progress" role="status" aria-live="polite">
      <div className="ai-progress-heading">
        <span className="ai-progress-mark" aria-hidden="true">
          <Sparkles size={18} />
        </span>
        <div>
          <strong>Generating AI insights</strong>
          <p>
            Reviewing verified internship indicators and preparing an analysis
            for the selected scope.
          </p>
        </div>
      </div>
      <div className="ai-indeterminate-track" aria-hidden="true">
        <span />
      </div>
      <ol className="ai-workflow-stages" aria-label="Analysis workflow">
        {workflowStages.map((stage, index) => (
          <li key={stage.title}>
            <span aria-hidden="true">{index + 1}</span>
            <div>
              <strong>{stage.title}</strong>
              <p>{stage.copy}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="ai-result-skeletons" aria-hidden="true">
        {[
          "Overall Assessment",
          "Key Observations",
          "Recommended Actions",
        ].map((label) => (
          <div key={label}>
            <strong>{label}</strong>
            <i />
            <i className="short" />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatGeneratedAt(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function SupportingIndicators({ evidence }: { evidence: AnalyticsEvidence }) {
  const indicators = [
    {
      label: "Attendance verification",
      value: evidence.attendance,
      numerator: evidence.attendanceVerified,
      denominator: evidence.attendanceApplicable,
      icon: CheckCircle2,
      unit: "applicable sessions",
    },
    {
      label: "Weekly log approval",
      value: evidence.dailyLogApproval,
      numerator: evidence.dailyLogsApproved,
      denominator: evidence.dailyLogsApplicable,
      icon: ClipboardList,
      unit: "submitted logs",
    },
    {
      label: "Document compliance",
      value: evidence.documentCompliance,
      numerator: evidence.documentsCompliant,
      denominator: evidence.documentsRequired,
      icon: FileCheck2,
      unit: "required documents",
    },
    {
      label: "Evaluation finalization",
      value: evidence.evaluationFinalization,
      numerator: evidence.evaluationsFinalized,
      denominator: evidence.evaluationsApplicable,
      icon: BarChart3,
      unit: "reports",
    },
  ];
  return (
    <section className="ai-report-section ai-supporting-indicators">
      <h3>Supporting Indicators</h3>
      <div>
        {indicators.map((indicator) => {
          const Icon = indicator.icon;
          return (
            <article key={indicator.label}>
              <Icon size={18} aria-hidden="true" />
              <div>
                <span>{indicator.label}</span>
                <strong>
                  {indicator.value === null
                    ? "Not applicable"
                    : `${indicator.value}%`}
                </strong>
                <small>
                  {indicator.denominator > 0
                    ? `${indicator.numerator} of ${indicator.denominator} ${indicator.unit}`
                    : `No ${indicator.unit} yet`}
                </small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type AIInsightsPanelProps = {
  result: AIInsightResult | null;
  loading: boolean;
  error: string;
  retryable: boolean;
  confirmedEmpty: boolean;
  hasData: boolean;
  canGenerate?: boolean;
  scopeKey: string;
  scopeLabel: string;
  onGenerate: () => void;
  action?: { href: string; label: string };
};

export function AIInsightsPanel({
  result,
  loading,
  error,
  retryable,
  confirmedEmpty,
  hasData,
  canGenerate = true,
  scopeKey,
  scopeLabel,
  onGenerate,
  action,
}: AIInsightsPanelProps) {
  const visibleResult = result?.scopeKey === scopeKey ? result : null;
  const empty = confirmedEmpty || !hasData;

  return (
    <section className="card ai-insights-card" aria-labelledby="ai-insights-title">
      <div className="ai-insights-header">
        <div>
          <span className="ai-insights-eyebrow">
            <Sparkles size={15} aria-hidden="true" /> PRAXIZ AI
          </span>
          <h2 id="ai-insights-title">AI Performance Insights</h2>
          <p>
            AI-generated explanations of authorized PRAXIZ indicators. Check
            the recorded values below; generated text is not an official finding.
          </p>
        </div>
        <button
          type="button"
          className="button button-primary"
          disabled={loading || empty || !canGenerate}
          onClick={onGenerate}
        >
          {visibleResult ? <RefreshCw size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          {visibleResult ? "Regenerate insights" : "Generate AI insights"}
        </button>
      </div>

      {loading && visibleResult && (
        <div className="ai-refresh-notice" role="status" aria-live="polite">
          <RefreshCw size={16} aria-hidden="true" />
          <span>
            Refreshing this analysis. Previous insights remain visible until the
            new response is ready.
          </span>
        </div>
      )}

      {error && (
        <div className="ai-error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <div>
            <strong>Unable to generate AI insights</strong>
            <span>{error}</span>
          </div>
          {retryable && (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={onGenerate}
              disabled={loading}
            >
              Try again
            </button>
          )}
        </div>
      )}

      {loading && !visibleResult ? (
        <AIInsightLoadingState />
      ) : empty && !visibleResult ? (
        <div className="ai-empty-state">
          <BarChart3 size={22} aria-hidden="true" />
          <div>
            <h3>No analytics available for this scope</h3>
            <p>
              There are no sufficient authorized internship records available
              to generate insights for the selected scope.
            </p>
          </div>
        </div>
      ) : visibleResult ? (
        <div className="ai-report" aria-live="polite">
          <div className="ai-report-meta" aria-label="Analysis details">
            <span><b>Scope</b>{scopeLabel}</span>
            {visibleResult.evidence && (
              <span><b>Interns included</b>{visibleResult.evidence.assignedInterns}</span>
            )}
            {visibleResult.generatedAt && (
              <span><b>Generated</b>{formatGeneratedAt(visibleResult.generatedAt)}</span>
            )}
          </div>

          <section className="ai-report-section ai-overall-assessment">
            <h3>Overall Assessment</h3>
            <p>{visibleResult.summary}</p>
          </section>

          <section className="ai-report-section">
            <h3>Key Observations</h3>
            {visibleResult.patterns.length ? (
              <ul className="ai-observation-list">
                {visibleResult.patterns.map((pattern, index) => (
                  <li key={`${index}-${pattern}`}>
                    <CheckCircle2 size={17} aria-hidden="true" />
                    <span>{pattern}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-note">
                No additional observation was identified from the available
                verified indicators.
              </p>
            )}
          </section>

          <section className="ai-report-section">
            <h3>Recommended Actions</h3>
            {visibleResult.recommendations.length ? (
              <ol className="ai-action-list">
                {visibleResult.recommendations.map((recommendation, index) => (
                  <li key={`${index}-${recommendation}`}>
                    <b aria-hidden="true">{index + 1}</b>
                    <span>{recommendation}</span>
                    {index === 0 && action && (
                      <a className="text-link" href={action.href}>
                        {action.label}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted-note">
                No additional follow-up action was generated.
              </p>
            )}
          </section>

          {visibleResult.evidence && (
            <SupportingIndicators evidence={visibleResult.evidence} />
          )}
        </div>
      ) : (
        <div className="ai-ready-state">
          <Sparkles size={20} aria-hidden="true" />
          <p>
            {canGenerate
              ? "Generate a structured analysis of the verified indicators in the selected authorized scope."
              : "Select a specific authorized target to generate insights for this analysis scope."}
          </p>
        </div>
      )}

      <div className="ai-disclaimer">
        <ShieldCheck size={17} aria-hidden="true" />
        <p>
          Advisory AI interpretation only. The server-authorized source
          indicators shown above are the evidence for this text. Verified PRAXIZ
          records and authorized human decisions remain authoritative.
        </p>
      </div>
    </section>
  );
}

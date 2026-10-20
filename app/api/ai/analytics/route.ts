import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import {
  generateWithOllama,
  OllamaRequestError,
  ollamaErrorResponse,
} from "../../../../lib/ollama";
import {
  detectAnalyticsConcerns,
  parseAnalyticsModelResponse,
  type AnalyticsEvidence,
} from "../../../analytics-insights";
import {
  applyAssignmentScopeFilters,
  assignmentSelectForScope,
  type AnalysisScope,
} from "./assignment-query";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AssignmentRow = {
  id: string;
  student_user_id: string;
  hte_id: string;
  status: string;
};
type ProgressRow = {
  internship_assignment_id: string;
  total_sessions: number | string;
  verified_sessions: number | string;
  submitted_logs: number | string;
  approved_logs: number | string;
  required_documents: number | string;
  satisfied_documents: number | string;
  has_open_issues: boolean;
};

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let stage = "authenticate";
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return NextResponse.json(
        { error: "You must be signed in to use AI analytics." },
        { status: 401 },
      );

    stage = "authorize-role";
    const now = new Date().toISOString();
    const [roleResult, profileResult] = await Promise.all([
      supabase
        .from("role_assignments")
        .select("roles!inner(code,is_active)")
        .eq("user_id", user.id)
        .in("roles.code", ["internship_coordinator", "placement_head"])
        .eq("roles.is_active", true)
        .is("deleted_at", null)
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gt.${now}`),
      supabase.from("profiles").select("account_status").eq("id", user.id).single(),
    ]);
    const { data: roleRows, error: roleError } = roleResult;
    if (roleError || profileResult.error || profileResult.data?.account_status !== "active" || !roleRows?.length)
      return NextResponse.json(
        {
          error: "You are not authorized to generate these insights.",
        },
        { status: 403 },
      );
    const activeCodes = new Set(
      roleRows.flatMap((row) => {
        const joined = row.roles as
          | { code?: string }
          | Array<{ code?: string }>
          | null;
        return [Array.isArray(joined) ? joined[0]?.code : joined?.code].filter(
          Boolean,
        );
      }),
    );
    const isPlacementHead = activeCodes.has("placement_head");

    stage = "validate-request";
    const body = (await request.json()) as {
      scope?: unknown;
      section?: unknown;
      hteId?: unknown;
      studentId?: unknown;
      coordinatorId?: unknown;
    };
    const scope: AnalysisScope | null =
      body.scope === "overall" ||
      body.scope === "section" ||
      body.scope === "hte" ||
      body.scope === "student" ||
      body.scope === "coordinator"
        ? body.scope
        : null;
    const section =
      typeof body.section === "string" && body.section.trim().length <= 40
        ? body.section.trim()
        : "";
    const hteId =
      typeof body.hteId === "string" && /^[0-9a-f-]{36}$/i.test(body.hteId)
        ? body.hteId
        : "";
    const studentId =
      typeof body.studentId === "string" &&
      /^[0-9a-f-]{36}$/i.test(body.studentId)
        ? body.studentId
        : "";
    const coordinatorId =
      typeof body.coordinatorId === "string" &&
      /^[0-9a-f-]{36}$/i.test(body.coordinatorId)
        ? body.coordinatorId
        : "";
    if (
      !scope ||
      (scope === "section" && !section) ||
      (scope === "hte" && !hteId) ||
      (scope === "student" && !studentId) ||
      (scope === "coordinator" && !coordinatorId) ||
      (scope === "coordinator" && !isPlacementHead)
    )
      return NextResponse.json(
        { error: "Select a valid analytics scope and target." },
        { status: 400 },
      );

    // The authenticated client keeps Supabase RLS authoritative. Target IDs are
    // then intersected with those already-authorized assignment rows, so changing
    // an ID in the request cannot widen the coordinator's scope.
    stage = "load-authorized-assignments";
    const assignmentQuery = applyAssignmentScopeFilters(
      supabase
        .from("internship_assignments")
        .select<string, AssignmentRow>(assignmentSelectForScope(scope))
        .in("status", ["active", "completed"])
        .is("deleted_at", null),
      scope,
      { section, hteId, studentId, coordinatorId },
      now,
    );
    const { data: assignmentData, error: assignmentError } =
      await assignmentQuery;
    if (assignmentError) throw new Error(assignmentError.message);
    const assignments = (assignmentData ?? []) as unknown as AssignmentRow[];
    if (!assignments.length) {
      const message =
        scope === "overall"
          ? "No authorized internship analytics are available yet."
          : "The selected target is outside your authorized scope or has no active internship assignment.";
      return NextResponse.json(
        { error: message },
        { status: scope === "overall" ? 404 : 403 },
      );
    }

    const assignmentIds = assignments.map((item) => item.id);
    stage = "load-verified-indicators";
    const [
      { data: progressData, error: progressError },
      { data: evaluationData, error: evaluationError },
    ] = await Promise.all([
      supabase
        .from("assignment_progress")
        .select(
          "internship_assignment_id,total_sessions,verified_sessions,submitted_logs,approved_logs,required_documents,satisfied_documents,has_open_issues",
        )
        .in("internship_assignment_id", assignmentIds),
      supabase
        .from("evaluations")
        .select(
          "internship_assignment_id,status,evaluation_templates!inner(evaluator_type)",
        )
        .in("internship_assignment_id", assignmentIds)
        .eq("evaluation_templates.evaluator_type", "hte")
        .is("deleted_at", null),
    ]);
    if (progressError) throw new Error(progressError.message);
    if (evaluationError) throw new Error(evaluationError.message);
    const progress = (progressData ?? []) as ProgressRow[];
    const sum = (
      key: keyof Pick<
        ProgressRow,
        | "total_sessions"
        | "verified_sessions"
        | "submitted_logs"
        | "approved_logs"
        | "required_documents"
        | "satisfied_documents"
      >,
    ) => progress.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    const attendanceApplicable = sum("total_sessions");
    const attendanceVerified = sum("verified_sessions");
    const dailyLogsApplicable = sum("submitted_logs");
    const dailyLogsApproved = sum("approved_logs");
    const documentsRequired = sum("required_documents");
    const documentsCompliant = sum("satisfied_documents");
    const evaluations = (evaluationData ?? []) as Array<{
      internship_assignment_id: string;
      status: string;
    }>;
    const evaluationsFinalized = evaluations.filter(
      (item) => item.status === "finalized",
    ).length;
    const concerns = new Set(
      progress
        .filter((item) => item.has_open_issues)
        .map((item) => item.internship_assignment_id),
    ).size;
    const evidence: AnalyticsEvidence = {
      attendance: percentage(attendanceVerified, attendanceApplicable),
      attendanceVerified,
      attendanceApplicable,
      dailyLogApproval: percentage(dailyLogsApproved, dailyLogsApplicable),
      dailyLogsApproved,
      dailyLogsApplicable,
      evaluationFinalization: percentage(
        evaluationsFinalized,
        evaluations.length,
      ),
      evaluationsFinalized,
      evaluationsApplicable: evaluations.length,
      documentCompliance: percentage(documentsCompliant, documentsRequired),
      documentsCompliant,
      documentsRequired,
      assignedInterns: new Set(assignments.map((item) => item.student_user_id))
        .size,
      concerns,
    };
    const detectedConcerns = detectAnalyticsConcerns(evidence);
    const scopeLabel =
      scope === "overall"
        ? "the user’s authorized overall scope"
        : scope === "section"
          ? `authorized Section ${section}`
          : scope === "hte"
            ? "the selected authorized HTE"
            : scope === "coordinator"
              ? "the selected authorized coordinator"
              : "the selected authorized student";

    const prompt = `You are the AI performance-analysis component of PRAXIZ, Partido State University's internship monitoring platform.

Analyze ${scopeLabel}. The indicators below were calculated server-side from Supabase records visible through the authenticated user's RLS scope.

Rules:
- Never invent or change records, grades, people, assignments, or comparisons.
- Do not make academic decisions or label a student as good, bad, or high risk.
- Evaluation finalization is workflow completion, not a grade.
- Treat deterministic PRAXIZ concerns as authoritative.
- Use factual observations and suggested areas for authorized human review.

STRUCTURED INDICATORS:
Scope: ${scope}
Assigned interns: ${evidence.assignedInterns}
Assignments with open issues: ${evidence.concerns}
Attendance verification: ${evidence.attendance === null ? "No applicable sessions" : `${evidence.attendance}% (${attendanceVerified}/${attendanceApplicable})`}
Weekly Log approval: ${evidence.dailyLogApproval === null ? "No submitted Weekly Logs" : `${evidence.dailyLogApproval}% (${dailyLogsApproved}/${dailyLogsApplicable})`}
Document compliance: ${evidence.documentCompliance === null ? "No required documents" : `${evidence.documentCompliance}% (${documentsCompliant}/${documentsRequired})`}
Evaluation finalization: ${evidence.evaluationFinalization === null ? "No evaluation reports" : `${evidence.evaluationFinalization}% (${evaluationsFinalized}/${evaluations.length})`}
Deterministic concerns: ${detectedConcerns.length ? detectedConcerns.map((item) => `${item.severity}: ${item.indicator} — ${item.message}`).join("; ") : "None triggered"}

Return only valid JSON: {"summary":"Short assessment","patterns":["Observation"],"recommendations":["Authorized human action"]}`;

    stage = "generate-insights";
    const ollamaData = await generateWithOllama({
      prompt,
      options: { temperature: 0.2 },
      format: "json",
      context: "analytics-insights",
    });
    stage = "parse-model-output";
    let analysis;
    try {
      analysis = parseAnalyticsModelResponse(ollamaData.response);
    } catch {
      throw new OllamaRequestError("MODEL_OUTPUT_INVALID");
    }
    return NextResponse.json(
      {
        ...analysis,
        risks: detectedConcerns,
        evidence,
        scope,
        model: ollamaData.model,
        source: "ollama",
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    const failure = ollamaErrorResponse(error);
    console.error("PRAXIZ AI analytics failed", {
      category: error instanceof Error ? error.name : "UnknownError",
      code: failure.body.kind,
      stage,
      durationMs: Date.now() - startedAt,
    });
    const unavailableKinds = new Set([
      "CONFIGURATION_MISSING",
      "CONFIGURATION_INVALID",
      "PROVIDER_UNREACHABLE",
      "MODEL_UNAVAILABLE",
      "AUTHENTICATION_FAILED",
    ]);
    const message = unavailableKinds.has(failure.body.kind)
      ? "PRAXIZ AI is temporarily unavailable. Verified analytics remain available."
      : `${failure.body.error} Verified analytics remain available.`;
    return NextResponse.json(
      {
        ...failure.body,
        error: message,
      },
      { status: failure.status },
    );
  }
}

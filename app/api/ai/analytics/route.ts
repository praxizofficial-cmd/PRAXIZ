import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type AnalyticsInput = {
  attendance: number | null;
  attendanceVerified: number;
  attendanceApplicable: number;
  dailyLogApproval: number | null;
  dailyLogsApproved: number;
  dailyLogsApplicable: number;
  evaluationFinalization: number | null;
  evaluationsFinalized: number;
  evaluationsApplicable: number;
  documentCompliance: number | null;
  documentsCompliant: number;
  documentsRequired: number;
  assignedInterns: number;
  concerns: number;
  ruleBasedAlerts: string[];
};

export async function POST(request: Request) {
  try {
    // Require an authenticated PRAXIZ user.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "You must be signed in to use AI analytics." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Partial<AnalyticsInput>;

    const optionalNumber = (value: unknown) => value == null ? null : Number(value);
    const attendance = optionalNumber(body.attendance);
    const attendanceVerified = Number(body.attendanceVerified);
    const attendanceApplicable = Number(body.attendanceApplicable);
    const dailyLogApproval = optionalNumber(body.dailyLogApproval);
    const dailyLogsApproved = Number(body.dailyLogsApproved);
    const dailyLogsApplicable = Number(body.dailyLogsApplicable);
    const evaluationFinalization = optionalNumber(body.evaluationFinalization);
    const evaluationsFinalized = Number(body.evaluationsFinalized);
    const evaluationsApplicable = Number(body.evaluationsApplicable);
    const documentCompliance = optionalNumber(body.documentCompliance);
    const documentsCompliant = Number(body.documentsCompliant);
    const documentsRequired = Number(body.documentsRequired);
    const assignedInterns = Number(body.assignedInterns);
    const concerns = Number(body.concerns);
    const ruleBasedAlerts = Array.isArray(body.ruleBasedAlerts) ? body.ruleBasedAlerts.filter((item): item is string => typeof item === "string").slice(0, 12) : [];

    // Nullable percentages are valid when there is no applicable data yet.
    // Validate the required counts separately so a null percentage does not
    // incorrectly reject an otherwise valid analytics request with HTTP 400.
    const counts = [
      attendanceVerified,
      attendanceApplicable,
      dailyLogsApproved,
      dailyLogsApplicable,
      evaluationsFinalized,
      evaluationsApplicable,
      documentsCompliant,
      documentsRequired,
      assignedInterns,
      concerns,
    ];
    const percentages = [
      attendance,
      dailyLogApproval,
      evaluationFinalization,
      documentCompliance,
    ];

    if (counts.some((value) => !Number.isFinite(value)) || percentages.some((value) => value !== null && !Number.isFinite(value))) {
      return NextResponse.json(
        { error: "Valid analytics values are required." },
        { status: 400 }
      );
    }

    /*
     * Deterministic PRAXIZ concern detection.
     *
     * Ollama does NOT decide the official risk conditions.
     * PRAXIZ determines them first from verified indicators.
     */
    const detectedConcerns: Array<{
      severity: "high" | "medium" | "low";
      indicator: string;
      message: string;
    }> = [];
if (attendanceApplicable > 0 && attendance !== null && attendance < 60) {
  detectedConcerns.push({
    severity: "high",
    indicator: "Attendance verification",
    message: `Attendance verification is ${attendance}% (${attendanceVerified} of ${attendanceApplicable} applicable sessions).`,
  });
} else if (attendanceApplicable > 0 && attendance !== null && attendance < 80) {
  detectedConcerns.push({
    severity: "medium",
    indicator: "Attendance verification",
    message: `Attendance verification is ${attendance}% (${attendanceVerified} of ${attendanceApplicable} applicable sessions).`,
  });
}

if (dailyLogsApplicable > 0 && dailyLogApproval !== null && dailyLogApproval < 50) {
  detectedConcerns.push({
    severity: "high",
    indicator: "Daily log approval",
    message: `Daily log approval is ${dailyLogApproval}% (${dailyLogsApproved} of ${dailyLogsApplicable} submitted logs).`,
  });
} else if (dailyLogsApplicable > 0 && dailyLogApproval !== null && dailyLogApproval < 75) {
  detectedConcerns.push({
    severity: "medium",
    indicator: "Daily log approval",
    message: `Daily log approval is ${dailyLogApproval}% (${dailyLogsApproved} of ${dailyLogsApplicable} submitted logs).`,
  });
}

if (documentsRequired > 0 && documentCompliance !== null && documentCompliance < 50) {
  detectedConcerns.push({
    severity: "high",
    indicator: "Document compliance",
    message: `Document compliance is ${documentCompliance}% (${documentsCompliant} of ${documentsRequired} required documents).`,
  });
} else if (documentsRequired > 0 && documentCompliance !== null && documentCompliance < 75) {
  detectedConcerns.push({
    severity: "medium",
    indicator: "Document compliance",
    message: `Document compliance is ${documentCompliance}% (${documentsCompliant} of ${documentsRequired} required documents).`,
  });
}

if (evaluationsApplicable > 0 && evaluationFinalization !== null && evaluationFinalization < 50) {
  detectedConcerns.push({
    severity: "medium",
    indicator: "Evaluation finalization",
    message: `Evaluation finalization is ${evaluationFinalization}% (${evaluationsFinalized} of ${evaluationsApplicable} reports).`,
  });
}

const ollamaBaseUrl =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  
    const model =
      process.env.OLLAMA_MODEL || "llama3.2";

    const prompt = `
You are the AI performance-analysis component of PRAXIZ,
the internship monitoring and management system of Partido State University.

You are assisting an Internship Coordinator.

IMPORTANT:
- The numeric indicators below were calculated by PRAXIZ.
- Never invent students, attendance records, daily logs, documents,
  evaluations, grades, internship assignments, or university records.
- Never change the supplied values.
- Do not make official academic decisions.
- Do not diagnose or label students.
- Treat PRAXIZ deterministic concern rules as authoritative.
- Your job is to interpret the supplied indicators, identify observable
  patterns, explain concerns, and recommend reasonable coordinator
  follow-up actions.
- Evaluation finalization is workflow completion and must NOT be described
  as an evaluation grade or student performance score.

VERIFIED PRAXIZ ANALYTICS:

Assigned interns: ${assignedInterns}
Interns meeting existing follow-up rule: ${concerns}

Attendance verification: ${attendance === null ? "No applicable sessions" : `${attendance}% (${attendanceVerified}/${attendanceApplicable})`}
Daily log approval: ${dailyLogApproval === null ? "No submitted logs" : `${dailyLogApproval}% (${dailyLogsApproved}/${dailyLogsApplicable})`}
Evaluation finalization: ${evaluationFinalization === null ? "No evaluation reports" : `${evaluationFinalization}% (${evaluationsFinalized}/${evaluationsApplicable})`}
Document compliance: ${documentCompliance === null ? "No required documents" : `${documentCompliance}% (${documentsCompliant}/${documentsRequired})`}

PRAXIZ RULE-BASED CONCERNS:
${
  (ruleBasedAlerts.length ? ruleBasedAlerts : detectedConcerns.map(item => `${item.indicator}: ${item.message}`)).length
    ? detectedConcerns
        .map(
          (item) =>
            `- ${item.severity.toUpperCase()}: ${item.indicator} — ${item.message}`
        )
        .join("\n")
    : "- No concern threshold was triggered."
}

Return ONLY valid JSON using this exact structure:

{
  "summary": "Short overall analysis",
  "patterns": [
    "Pattern one",
    "Pattern two"
  ],
  "recommendations": [
    "Recommended action one",
    "Recommended action two"
  ]
}

Do not include markdown.
Do not wrap the JSON in code fences.
`.trim();

    const ollamaResponse = await fetch(
      `${ollamaBaseUrl}/api/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: "json",
          options: {
            temperature: 0.2,
          },
        }),
      }
    );

    if (!ollamaResponse.ok) {
      const detail = await ollamaResponse.text();

      console.error(
        "PRAXIZ analytics Ollama failure:",
        ollamaResponse.status,
        detail
      );

      return NextResponse.json(
        { error: "AI performance analysis is currently unavailable." },
        { status: 502 }
      );
    }

    const ollamaData = await ollamaResponse.json();

    let analysis: { summary: string; patterns: string[]; recommendations: string[] };
    try {
      const parsed = JSON.parse(ollamaData.response) as Partial<typeof analysis>;
      analysis = {
        summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
        patterns: Array.isArray(parsed.patterns) ? parsed.patterns.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean).slice(0, 6) : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean).slice(0, 6) : [],
      };
    } catch {
      // Keep verified data useful even when a local model returns malformed output.
      analysis = {
        summary: assignedInterns ? `The current analysis contains ${assignedInterns} active intern${assignedInterns === 1 ? "" : "s"}.` : "No active interns are currently represented in this analysis.",
        patterns: detectedConcerns.map(item => `${item.indicator}: ${item.message}`).slice(0, 6),
        recommendations: detectedConcerns.map(item => `Review ${item.indicator.toLowerCase()} within the authorized workflow.`).slice(0, 6),
      };
    }

    return NextResponse.json(
      {
        summary: analysis.summary || "",
        patterns: Array.isArray(analysis.patterns)
          ? analysis.patterns
          : [],
        risks: detectedConcerns,
        recommendations: Array.isArray(analysis.recommendations)
          ? analysis.recommendations
          : [],
        model,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "PRAXIZ AI analytics failed:",
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      { error: "Performance analysis could not be generated." },
      { status: 500 }
    );
  }
}

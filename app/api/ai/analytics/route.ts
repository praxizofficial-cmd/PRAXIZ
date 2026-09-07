import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { ollamaGenerateUrl, ollamaHeaders } from "../../../../lib/ollama";
import { detectAnalyticsConcerns, parseAnalyticsModelResponse, type AnalyticsEvidence } from "../../../analytics-insights";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AnalyticsInput = AnalyticsEvidence;

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

    const countPairs = [
      [attendanceVerified, attendanceApplicable],
      [dailyLogsApproved, dailyLogsApplicable],
      [evaluationsFinalized, evaluationsApplicable],
      [documentsCompliant, documentsRequired],
    ];
    if (
      counts.some((value) => !Number.isInteger(value) || value < 0)
      || percentages.some((value) => value !== null && (!Number.isFinite(value) || value < 0 || value > 100))
      || countPairs.some(([numerator, denominator]) => numerator > denominator)
      || concerns > assignedInterns
    ) {
      return NextResponse.json(
        { error: "Valid analytics values are required." },
        { status: 400 }
      );
    }

    /* Concern thresholds remain deterministic and authoritative even when the
       optional language model is unavailable. */
    const evidence: AnalyticsEvidence = {
      attendance,
      attendanceVerified,
      attendanceApplicable,
      dailyLogApproval,
      dailyLogsApproved,
      dailyLogsApplicable,
      evaluationFinalization,
      evaluationsFinalized,
      evaluationsApplicable,
      documentCompliance,
      documentsCompliant,
      documentsRequired,
      assignedInterns,
      concerns,
    };
    const detectedConcerns = detectAnalyticsConcerns(evidence);

    const apiKey = process.env.OLLAMA_API_KEY?.trim();
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL
      || (apiKey ? "https://ollama.com" : "http://localhost:11434");
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
  detectedConcerns.length
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

    const ollamaResponse = await fetch(ollamaGenerateUrl(ollamaBaseUrl), {
      method: "POST",
      headers: ollamaHeaders(apiKey),
      // Ollama Cloud does not support the `format` structured-output option.
      // The prompt requests JSON and the response is parsed and validated below.
      body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.2 } }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!ollamaResponse.ok) {
      const detail = (await ollamaResponse.text()).slice(0, 500);
      console.error("PRAXIZ Ollama analytics request failed:", ollamaResponse.status, detail);
      return NextResponse.json(
        { error: "AI insights are temporarily unavailable. Please contact the system administrator if this continues." },
        { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } }
      );
    }
    const ollamaData = await ollamaResponse.json() as { response?: unknown };
    if (typeof ollamaData.response !== "string") throw new Error("Ollama returned an invalid response");
    const analysis = parseAnalyticsModelResponse(ollamaData.response);
    return NextResponse.json({
      ...analysis,
      risks: detectedConcerns,
      model,
      source: "ollama",
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
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

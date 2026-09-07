import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'You must be signed in to use PRAXIZ AI.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const prompt =
      typeof body?.prompt === 'string'
        ? body.prompt.trim()
        : '';

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required.' },
        { status: 400 }
      );
    }

    if (prompt.length > 4000) {
      return NextResponse.json(
        { error: 'Prompt is too long.' },
        { status: 400 }
      );
    }

    const ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    const model =
      process.env.OLLAMA_MODEL || 'llama3.2';

    const systemPrompt = `
You are the AI assistant integrated into PRAXIZ,
the internship management system of Partido State University.

PRAXIZ supports multiple Partido State University campuses.

Valid PRAXIZ user roles are:
- Student Intern
- Internship Coordinator
- HTE Representative
- System Administrator

Rules:
- Never invent PRAXIZ records or database information.
- Never invent attendance, daily logs, assignments, evaluations,
  document submissions, users, grades, or internship information.
- Never claim an action was completed unless PRAXIZ confirms it.
- Do not create or refer to a Faculty Supervisor role.
- Internship monitoring and academic review are handled by
  Internship Coordinators.
- HTE Representatives handle applicable workplace confirmation,
  feedback, and evaluation responsibilities.
- Be concise, professional, and relevant to internship management.
`.trim();

    const ollamaResponse = await fetch(
      `${ollamaBaseUrl}/api/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
            ...(process.env.OLLAMA_API_KEY
             ? {
        Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
      }
    : {}),
},
        body: JSON.stringify({
          model,
          stream: false,
          prompt: `${systemPrompt}

User request:
${prompt}`,
        }),
      }
    );

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();

      console.error(
        'Ollama request failed:',
        ollamaResponse.status,
        errorText
      );

      return NextResponse.json(
        { error: 'PRAXIZ AI is currently unavailable.' },
        { status: 502 }
      );
    }

    const result = await ollamaResponse.json();

    return NextResponse.json({
      response: result.response ?? '',
      model,
    });
  } catch (error) {
    console.error(
      'PRAXIZ AI route failed:',
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      { error: 'Unable to process the AI request.' },
      { status: 500 }
    );
  }
}
import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { ollamaGenerateUrl, ollamaHeaders } from '../../../lib/ollama';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ConversationMessage = { role: 'user' | 'assistant'; content: string };

const roleGuidance: Record<string, string> = {
  student_intern: 'Help with the signed-in student’s own attendance, Weekly Logs, document submissions, evaluations, and assignment workflow. Never instruct them to review or alter another user’s records.',
  internship_coordinator: 'Help with coordinator workflows within authorized campus, college, program, HTE, and student scope. Never imply university-wide access or autonomous academic decisions.',
  hte_supervisor: 'Help with assigned-intern attendance confirmation, Weekly Log review, feedback, and evaluations for the representative’s own HTE. Never imply access to another HTE or university-wide records.',
  system_admin: 'Help with registration review, institutional setup, HTE verification, role governance, and account recovery. Never reveal secrets, bypass approval, or claim that a record was changed.',
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'You must be signed in to use PRAXIZ AI.' }, { status: 401 });

    const now = new Date().toISOString();
    const [{ data: assignments, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.from('role_assignments').select('roles!inner(code,is_active)').eq('user_id', user.id).eq('roles.is_active', true).is('deleted_at', null).lte('starts_at', now).or(`ends_at.is.null,ends_at.gt.${now}`),
      supabase.from('profiles').select('metadata,account_status').eq('id', user.id).single(),
    ]);
    if (roleError || profileError || profile?.account_status !== 'active') return NextResponse.json({ error: 'Your active PRAXIZ role could not be verified.' }, { status: 403 });
    const roleCodes = (assignments ?? []).map(row => {
      const joined = row.roles as { code?: string } | Array<{ code?: string }> | null;
      return (Array.isArray(joined) ? joined[0]?.code : joined?.code) ?? '';
    }).filter(code => code in roleGuidance);
    const preferred = typeof profile.metadata === 'object' && profile.metadata ? (profile.metadata as { primary_role?: unknown }).primary_role : null;
    const roleCode = typeof preferred === 'string' && roleCodes.includes(preferred) ? preferred : roleCodes[0];
    if (!roleCode) return NextResponse.json({ error: 'Your PRAXIZ role is not authorized to use the assistant.' }, { status: 403 });

    const body = await request.json();
    const rawMessages = Array.isArray(body?.messages) ? body.messages : typeof body?.prompt === 'string' ? [{ role: 'user', content: body.prompt }] : [];
    const messages: ConversationMessage[] = rawMessages.slice(-12).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as { role?: unknown; content?: unknown };
      const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null;
      const content = typeof record.content === 'string' ? record.content.trim() : '';
      return role && content && content.length <= 4000 ? [{ role, content }] : [];
    });
    if (!messages.length || messages.at(-1)?.role !== 'user') return NextResponse.json({ error: 'A user message is required.' }, { status: 400 });
    if (messages.reduce((sum, item) => sum + item.content.length, 0) > 12000) return NextResponse.json({ error: 'The conversation is too long. Start a new chat and try again.' }, { status: 400 });

    const apiKey = process.env.OLLAMA_API_KEY?.trim();
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || (apiKey ? 'https://ollama.com' : 'http://localhost:11434');
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    const transcript = messages.map(item => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content}`).join('\n\n');
    const systemPrompt = `You are the conversational assistant integrated into PRAXIZ, Partido State University's internship monitoring platform.

The trusted backend resolved the current role as: ${roleCode}.
Role boundary: ${roleGuidance[roleCode]}

Rules:
- Give concise workflow guidance using short paragraphs or steps.
- Never invent PRAXIZ records, database values, attendance, logs, assignments, evaluations, documents, grades, or users.
- Never claim an action was completed unless PRAXIZ confirms it.
- Never ask the user to select or disclose their role; it is already verified.
- Do not create or refer to an obsolete supervisory role.
- Do not give instructions for actions outside the verified role boundary.
- Explain when a request requires an authorized human or a specific PRAXIZ screen.
- The assistant cannot approve records, finalize evaluations, assign grades, or change official data.`;

    const ollamaResponse = await fetch(ollamaGenerateUrl(ollamaBaseUrl), {
      method: 'POST',
      headers: ollamaHeaders(apiKey),
      body: JSON.stringify({ model, stream: false, prompt: `${systemPrompt}\n\nConversation:\n${transcript}\n\nAssistant:` }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!ollamaResponse.ok) {
      console.error('Ollama request failed:', ollamaResponse.status, (await ollamaResponse.text()).slice(0, 500));
      return NextResponse.json({ error: 'PRAXIZ AI is currently unavailable.' }, { status: 502 });
    }
    const result = await ollamaResponse.json() as { response?: unknown };
    const response = typeof result.response === 'string' ? result.response.trim() : '';
    if (!response) return NextResponse.json({ error: 'PRAXIZ AI did not return a usable response.' }, { status: 502 });
    return NextResponse.json({ response, model }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('PRAXIZ AI route failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Unable to process the AI request.' }, { status: 500 });
  }
}

import { createClient } from '../../../../../lib/supabase/server';
import { generateEvaluationPdf, type FinalizedEvaluationReport } from '../../../../../lib/evaluation-report';
import fontData from '../../../../../lib/report-assets/DejaVuSans.ttf?inline';
import sealData from '../../../../../lib/report-assets/parsu-logo.png?inline';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response('Not found', { status: 404, headers });
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return new Response('Sign in to view this report.', { status: 401, headers });
    // Uses the caller's session and RLS, never a service-role key.
    const { data, error } = await supabase.rpc('get_finalized_evaluation_report', { p_evaluation_id: id });
    if (error || !data) return new Response('This finalized report is not available to your account.', { status: 404, headers });
    const decode = (url: string) => Uint8Array.from(Buffer.from(url.slice(url.indexOf(',')+1), 'base64'));
    const bytes = await generateEvaluationPdf(data as FinalizedEvaluationReport, { font: decode(fontData), seal: decode(sealData) });
    return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="praxiz-evaluation-${id}.pdf"` } });
  } catch (error) {
    console.error('Evaluation PDF generation failed', error instanceof Error ? error.message : 'Unknown error');
    return new Response('The report could not be generated. Please try again.', { status: 500, headers });
  }
}

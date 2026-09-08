import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const recipient = 'praxiz.official@gmail.com';
const responseHeaders = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const recentRequests = new Map<string, number[]>();

function clean(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

function allowRequest(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const key = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  const active = (recentRequests.get(key) ?? []).filter(timestamp => now - timestamp < 10 * 60 * 1000);
  if (active.length >= 5) return false;
  recentRequests.set(key, [...active, now]);
  return true;
}

export async function POST(request: Request) {
  try {
    if (!allowRequest(request)) return NextResponse.json({ error: 'Too many messages were sent. Please try again later.' }, { status: 429, headers: responseHeaders });
    const body = await request.json() as Record<string, unknown>;
    const name = clean(body.name, 120);
    const email = clean(body.email, 160).toLowerCase();
    const subject = clean(body.subject, 160);
    const message = clean(body.message, 5000);
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || subject.length < 2 || message.length < 10) {
      return NextResponse.json({ error: 'Enter a valid name, email address, subject, and message.' }, { status: 400, headers: responseHeaders });
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: 'Message delivery is temporarily unavailable. Please try again later.' }, { status: 503, headers: responseHeaders });
    const from = process.env.CONTACT_EMAIL_FROM?.trim() || 'PRAXIZ Support <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [recipient],
        reply_to: email,
        subject: `[PRAXIZ] ${subject}`,
        text: `Name: ${name}\nReply email: ${email}\n\n${message}`,
        html: `<h2>PRAXIZ contact message</h2><p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p>${escapeHtml(message).replaceAll('\n', '<br>')}</p>`,
      }),
    });
    if (!response.ok) throw new Error('The email provider rejected the request.');
    return NextResponse.json({ delivered: true }, { headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: 'Unable to send your message. Please try again.' }, { status: 500, headers: responseHeaders });
  }
}

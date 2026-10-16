import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicSupabaseEnv } from "../../../../lib/supabase/env";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SupportDatabase = {
  public: {
    Tables: {
      contact_messages: {
        Row: { id: string; sender_name: string; sender_email: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      support_message_replies: {
        Row: {
          id: string;
          responder_user_id: string;
          attempted_at: string;
        };
        Insert: {
          contact_message_id: string;
          responder_user_id: string;
          recipient_email: string;
          subject: string;
          body: string;
          delivery_status: "attempting" | "accepted" | "failed";
        };
        Update: {
          delivery_status?: "attempting" | "accepted" | "failed";
          provider_message_id?: string;
          provider_accepted_at?: string;
          failure_reason?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function createSupportAdmin(url: string, serviceKey: string) {
  return createSupabaseClient<SupportDatabase>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function response(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

function safeText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export async function POST(request: Request) {
  let replyId = "";
  let admin: ReturnType<typeof createSupportAdmin> | null = null;
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const env = getPublicSupabaseEnv();
    const caller = token
      ? createSupabaseClient(env.url, env.publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        })
      : await createClient();
    const { data: auth, error: authError } = await caller.auth.getUser();
    if (authError || !auth.user) return response("Sign in to reply to support messages.", 401);
    if (!token && request.headers.get("origin") !== new URL(request.url).origin)
      return response("This reply request is not allowed.", 403);

    const now = new Date().toISOString();
    const { data: roleRows, error: roleError } = await caller
      .from("role_assignments")
      .select("roles!inner(code,is_active),profiles!inner(account_status)")
      .eq("user_id", auth.user.id)
      .eq("roles.code", "system_admin")
      .eq("roles.is_active", true)
      .eq("profiles.account_status", "active")
      .is("deleted_at", null)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`);
    if (roleError || !roleRows?.length)
      return response("Only an active System Administrator may reply to support messages.", 403);

    const body = (await request.json()) as Record<string, unknown>;
    const messageId = safeText(body.messageId, 36);
    const subject = safeText(body.subject, 200);
    const message = safeText(body.message, 5000);
    if (!uuid.test(messageId) || subject.length < 2 || message.length < 2)
      return response("Enter a subject and reply between 2 and 5,000 characters.", 400);
    if (body.privacyAcknowledged !== true)
      return response("Confirm that the reply contains no private account or internship information.", 400);

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();
    const configuredFrom = process.env.CONTACT_EMAIL_FROM?.trim();
    if (!serviceKey || !resendKey || !configuredFrom)
      return response("Support email delivery is not configured. The reply was not sent.", 503);
    admin = createSupportAdmin(env.url, serviceKey);

    const [{ data: original, error: originalError }, { count, error: rateError }] = await Promise.all([
      admin
        .from("contact_messages")
        .select("id,sender_name,sender_email")
        .eq("id", messageId)
        .maybeSingle(),
      admin
        .from("support_message_replies")
        .select("id", { count: "exact", head: true })
        .eq("responder_user_id", auth.user.id)
        .gte("attempted_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()),
    ]);
    if (originalError || !original) return response("That support message is no longer available.", 404);
    if (rateError) return response("Reply history is temporarily unavailable. Nothing was sent.", 503);
    if ((count ?? 0) >= 5) return response("Too many replies were attempted. Wait a few minutes and retry.", 429);
    const recipient = String(original.sender_email).trim().toLowerCase();
    if (!emailPattern.test(recipient)) return response("The original sender address is not valid. Nothing was sent.", 409);
    const senderAddress = configuredFrom.match(/<([^>]+)>/)?.[1]?.trim() ?? configuredFrom;
    if (!emailPattern.test(senderAddress)) return response("The configured support sender address is invalid. Nothing was sent.", 503);

    const { data: attempt, error: attemptError } = await admin
      .from("support_message_replies")
      .insert({
        contact_message_id: messageId,
        responder_user_id: auth.user.id,
        recipient_email: recipient,
        subject,
        body: message,
        delivery_status: "attempting",
      })
      .select("id")
      .single();
    if (attemptError || !attempt) return response("The reply attempt could not be recorded. Nothing was sent.", 503);
    replyId = String(attempt.id);

    const providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `praxiz-support-${replyId}`,
      },
      body: JSON.stringify({
        from: configuredFrom,
        to: [recipient],
        reply_to: configuredFrom,
        subject,
        text: message,
      }),
    });
    const providerResult = (await providerResponse.json().catch(() => ({}))) as { id?: unknown };
    const providerId = typeof providerResult.id === "string" ? providerResult.id : "";
    if (!providerResponse.ok || !providerId) {
      await admin
        .from("support_message_replies")
        .update({ delivery_status: "failed", failure_reason: `provider_http_${providerResponse.status}` })
        .eq("id", replyId);
      return response("The email provider rejected the reply. It was not marked as sent.", 502);
    }

    const { error: acceptanceError } = await admin
      .from("support_message_replies")
      .update({
        delivery_status: "accepted",
        provider_message_id: providerId,
        provider_accepted_at: new Date().toISOString(),
        failure_reason: null,
      })
      .eq("id", replyId);
    if (acceptanceError)
      return response("The provider accepted the email, but PRAXIZ could not record confirmation. Check provider logs before retrying.", 500);

    return NextResponse.json(
      { accepted: true, replyId, message: "Reply accepted by the configured email provider." },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (replyId && admin) {
      try {
        await admin
          .from("support_message_replies")
          .update({ delivery_status: "failed", failure_reason: "delivery_request_failed" })
          .eq("id", replyId);
      } catch {
        // The primary failure is returned below; never hide it behind audit cleanup.
      }
    }
    console.error("Support reply failed", error instanceof Error ? error.message : "Unknown failure");
    return response("The reply could not be sent. The failed attempt remains in support history.", 500);
  }
}

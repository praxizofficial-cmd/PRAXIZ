import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../../lib/supabase/server";
import { getPublicSupabaseEnv } from "../../../lib/supabase/env";
import { PHOTO_MAX_BYTES, preparePhotoEvidence } from "../../../lib/photo-evidence-image";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const env = getPublicSupabaseEnv();
  const caller = token ? createSupabaseClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  }) : await createClient();
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return reply("Sign in to upload activity evidence.", 401);
  // Cookie-backed mutations require a same-origin request.
  if (!token && request.headers.get("origin") !== new URL(request.url).origin)
    return reply("This upload request is not allowed.", 403);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return reply("Photo uploads are not configured yet. Your written Weekly Log remains available.", 503);
  if (Number(request.headers.get("content-length")) > PHOTO_MAX_BYTES + 65536)
    return reply("Choose an image no larger than 5 MB.", 413);
  try {
    const form = await request.formData();
    const file = form.get("file");
    const logId = String(form.get("logId") ?? "");
    const date = String(form.get("date") ?? "");
    const caption = String(form.get("caption") ?? "").trim();
    const replacement = String(form.get("replacementId") ?? "");
    if (!(file instanceof File) || !uuid.test(logId) || (replacement && !uuid.test(replacement)) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) || caption.length > 500)
      return reply("Choose an image, activity date, and valid Weekly Log.", 400);
    if (file.size > PHOTO_MAX_BYTES) return reply("Choose an image no larger than 5 MB.", 413);
    const { data: log, error } = await caller.from("daily_logs")
      .select("id,internship_assignment_id,status,week_start_date,week_end_date,internship_assignments(student_user_id)")
      .eq("id", logId).is("deleted_at", null).maybeSingle();
    const assignment = Array.isArray(log?.internship_assignments) ? log.internship_assignments[0] : log?.internship_assignments;
    if (error || !log || assignment?.student_user_id !== user.id)
      return reply("This Weekly Log is not available for your account.", 403);
    if (!["draft", "needs_revision"].includes(log.status) || date < log.week_start_date || date > log.week_end_date)
      return reply("Photo uploads require an editable log and a date within its reporting week.", 409);
    let image;
    try { image = await preparePhotoEvidence(new Uint8Array(await file.arrayBuffer()), file.type); }
    catch { return reply("Use a valid JPEG, PNG, or WebP image (320 × 240 pixels or larger, at most 5 MB).", 400); }
    const admin = createSupabaseClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const path = `${user.id}/${log.internship_assignment_id}/${logId}/${date}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await admin.storage.from("weekly-log-photo-evidence")
      .upload(path, image.bytes, { contentType: image.mimeType, upsert: false });
    if (uploadError) return reply("The private image could not be uploaded. Please retry.", 503);
    const { data: id, error: registrationError } = await admin.rpc("register_weekly_log_photo_evidence_v26", {
      p_uploader_id: user.id, p_daily_log_id: logId, p_evidence_date: date, p_object_path: path,
      p_original_file_name: file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 255),
      p_mime_type: image.mimeType, p_file_size_bytes: image.bytes.length,
      p_pixel_width: image.width, p_pixel_height: image.height, p_caption: caption,
      p_replace_evidence_id: replacement || null,
    });
    if (registrationError) {
      // An ambiguous network error can follow a committed RPC. Confirm absence
      // before cleanup so a registered immutable original is never deleted.
      const check = await admin.from("weekly_log_photo_evidence").select("id").eq("object_path", path).maybeSingle();
      if (!check.error && !check.data) await admin.storage.from("weekly-log-photo-evidence").remove([path]);
      return reply("The photo could not be attached. Check the activity date, daily photo limit, and log status, then retry.", 409);
    }
    return NextResponse.json({ id }, { headers });
  } catch { return reply("The upload could not be processed. Please retry.", 400); }
}

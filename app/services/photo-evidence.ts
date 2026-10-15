import { createClient } from "../../lib/supabase/client";

export type PhotoEvidence = {
  id: string; evidence_date: string; caption: string; object_path: string;
  created_at: string; review_status: string; review_feedback: string | null;
  state: string; signedUrl?: string;
};
export type PhotoException = {
  id: string; evidence_date: string; reason: string; status: string;
  review_feedback: string | null;
};
export type PhotoPolicy = {
  requirement_mode: "optional" | "required"; max_photos_per_day: number;
  hte_name?: string; affected_active_assignments?: number;
};
export type PhotoBundle = {
  policy: PhotoPolicy | null; photos: PhotoEvidence[]; exceptions: PhotoException[];
  history: Array<{ id: string; action: string; entity_type: string; reason: string | null; occurred_at: string }>;
  days: Array<{ date: string; statuses: string[] }>;
};

export const photoEvidenceService = {
  async load(log: { id: string; assignmentId: string; weekStartDate: string; weekEndDate: string }): Promise<PhotoBundle> {
    const client = createClient();
    const results = await Promise.all([
      client.from("weekly_log_photo_policy_snapshots").select("requirement_mode,max_photos_per_day").eq("daily_log_id", log.id).maybeSingle(),
      client.from("weekly_log_photo_evidence").select("id,evidence_date,caption,object_path,created_at,review_status,review_feedback,state").eq("daily_log_id", log.id).order("created_at"),
      client.from("weekly_log_photo_evidence_exceptions").select("id,evidence_date,reason,status,review_feedback").eq("daily_log_id", log.id),
      client.from("attendance_sessions").select("work_date,status").eq("internship_assignment_id", log.assignmentId)
        .gte("work_date", log.weekStartDate).lte("work_date", log.weekEndDate).is("deleted_at", null),
      client.from("weekly_log_photo_evidence_audit").select("id,action,entity_type,reason,occurred_at").eq("daily_log_id", log.id).order("occurred_at", { ascending: false }),
    ]);
    if (results.some(result => result.error)) throw new Error("Activity evidence is unavailable. Please retry; your written log remains saved.");
    const photos = (results[1].data ?? []) as unknown as PhotoEvidence[];
    await Promise.all(photos.map(async photo => {
      const { data } = await client.storage.from("weekly-log-photo-evidence").createSignedUrl(photo.object_path, 300);
      photo.signedUrl = data?.signedUrl;
    }));
    const days = new Map<string, Set<string>>();
    for (const row of (results[3].data ?? []) as unknown as Array<{ work_date: string; status: string }>) {
      const statuses = days.get(row.work_date) ?? new Set<string>();
      statuses.add(row.status); days.set(row.work_date, statuses);
    }
    return {
      policy: results[0].data as unknown as PhotoPolicy | null,
      photos, exceptions: (results[2].data ?? []) as unknown as PhotoException[],
      history: (results[4].data ?? []) as unknown as PhotoBundle["history"],
      days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, statuses]) => ({ date, statuses: [...statuses] })),
    };
  },
  async upload(logId: string, date: string, file: File, caption: string, replacementId = "") {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) throw new Error("Sign in to upload evidence.");
    const form = new FormData();
    form.set("logId", logId); form.set("date", date); form.set("file", file);
    form.set("caption", caption); form.set("replacementId", replacementId);
    const response = await fetch("/api/weekly-log-photo-evidence", {
      method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Photo upload failed. Please retry.");
  },
  async remove(id: string) {
    const { error } = await createClient().rpc("remove_weekly_log_photo_evidence_v26", { p_evidence_id: id });
    if (error) throw new Error(error.message);
  },
  async requestException(logId: string, date: string, reason: string) {
    const { error } = await createClient().rpc("request_weekly_log_photo_exception_v26", { p_daily_log_id: logId, p_evidence_date: date, p_reason: reason });
    if (error) throw new Error(error.message);
  },
  async review(kind: "photo" | "exception", id: string, decision: "approved" | "rejected", feedback: string) {
    const { error } = await createClient().rpc(kind === "photo" ? "review_weekly_log_photo_evidence_v26" : "review_weekly_log_photo_exception_v26", {
      [kind === "photo" ? "p_evidence_id" : "p_exception_id"]: id, p_decision: decision, p_feedback: feedback,
    });
    if (error) throw new Error(error.message);
  },
  async policy(): Promise<PhotoPolicy> {
    const { data, error } = await createClient().rpc("get_my_hte_photo_evidence_policy_v26");
    if (error || !data?.[0]) throw new Error("Photo policy configuration is unavailable. Please retry.");
    return data[0] as PhotoPolicy;
  },
  async savePolicy(mode: string, limit: number, apply: boolean, reason: string) {
    const { error } = await createClient().rpc("save_my_hte_photo_evidence_policy_v26", {
      p_requirement_mode: mode, p_max_photos_per_day: limit, p_apply_to_active_assignments: apply, p_reason: reason,
    });
    if (error) throw new Error(error.message);
  },
};

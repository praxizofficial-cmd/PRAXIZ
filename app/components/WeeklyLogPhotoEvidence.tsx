"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { photoEvidenceService as service, type PhotoBundle, type PhotoPolicy } from "../services/photo-evidence";
import type { WeeklyLogRecord } from "../services/praxiz-services";
import { useAuth } from "../auth/supabase-auth";

export function WeeklyLogPhotoEvidence({ log, editable = false }: { log: WeeklyLogRecord; editable?: boolean }) {
  const { user } = useAuth();
  const [bundle, setBundle] = useState<PhotoBundle | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [date, setDate] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replacement, setReplacement] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const reload = useCallback(async () => {
    const value = await service.load(log); setBundle(value);
    setDate(previous => previous || value.days[0]?.date || "");
  }, [log]);
  useEffect(() => { let active = true;
    void service.load(log).then(value => { if (active) { setBundle(value); setDate(value.days[0]?.date ?? ""); } })
      .catch(() => { if (active) setError("Activity evidence is unavailable. Retry to load this section."); });
    return () => { active = false; };
  }, [log]);
  async function run(action: () => Promise<unknown>, message: string) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); await reload(); setNotice(message); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The change could not be saved. Please retry."); }
    finally { lock.current = false; setBusy(false); }
  }
  const canReview = user?.role === "hte" && log.status === "Submitted";
  const current = bundle?.photos.filter(photo => photo.state === "current") ?? [];
  const covered = bundle?.days.filter(day => current.some(photo => photo.evidence_date === day.date && photo.review_status === "approved") ||
    bundle.exceptions.some(exception => exception.evidence_date === day.date && exception.status === "approved")).length ?? 0;
  function reviewButtons(kind: "photo" | "exception", id: string) {
    return canReview && <div className="photo-review-actions">
      <label className="field"><span>Review reason</span><input maxLength={500} value={feedback[id] ?? ""}
        onChange={event => setFeedback(previous => ({ ...previous, [id]: event.target.value }))} /></label>
      <button type="button" className="button button-secondary" disabled={busy || (kind === "exception" && (feedback[id]?.trim().length ?? 0) < 3)}
        onClick={() => void run(() => service.review(kind, id, "approved", feedback[id] ?? ""), "Evidence review saved.")}>Approve {kind}</button>
      <button type="button" className="button button-secondary" disabled={busy || (feedback[id]?.trim().length ?? 0) < 3}
        onClick={() => void run(() => service.review(kind, id, "rejected", feedback[id] ?? ""), "Evidence review saved.")}>Reject {kind}</button>
    </div>;
  }
  return <section className="weekly-photo-evidence" aria-busy={busy}>
    <h3>Daily Activity Evidence</h3>
    {!bundle && !error && <p role="status">Loading activity evidence…</p>}
    <p>Photos document activities; they do not verify attendance or add hours. Avoid confidential documents, credentials, patients, and restricted areas. Embedded location metadata is removed.</p>
    {error && <p className="form-error" role="alert">{error} <button type="button" disabled={busy} onClick={() => void run(reload, "Evidence refreshed.")}>Retry</button></p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {bundle && <>
      <button type="button" className="table-link" disabled={busy} onClick={() => void run(reload, "Private previews refreshed.")}>Refresh private previews</button>
      <p><strong>{bundle.policy?.requirement_mode === "required" ? "Required daily" : "Optional"}</strong> · {covered}/{bundle.days.length} activity dates with approved evidence or exception.</p>
      <p>Dates come from recorded attendance, including unverified or incomplete sessions. Their attendance status remains separate.</p>
      {!bundle.days.length && <p>No recorded activity dates in this reporting week yet.</p>}
      {bundle.days.map(day => <details className="photo-activity-day" key={day.date}>
        <summary><strong>{day.date}</strong><span>Attendance: {day.statuses.join(", ").replaceAll("_", " ")}</span><small>{current.filter(photo => photo.evidence_date === day.date).length} photos · Exceptions: {bundle.exceptions.filter(item => item.evidence_date === day.date).map(item => item.status).join(", ") || "None"}</small></summary>
        {!current.some(photo => photo.evidence_date === day.date) && <p>No photo attached{bundle.policy?.requirement_mode === "required" ? " — attach evidence or request an exception." : "."}</p>}
        <div className="photo-evidence-grid">{current.filter(photo => photo.evidence_date === day.date).map(photo => <article key={photo.id}>
          {photo.signedUrl ? <a href={photo.signedUrl} target="_blank" rel="noopener noreferrer"><Image unoptimized src={photo.signedUrl} alt={photo.caption || `Activity evidence for ${day.date}`} width={320} height={240} /></a> : <p>Preview unavailable. Refresh this section.</p>}
          <p>{photo.caption || "No caption"}</p><small>Uploaded: {new Date(photo.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Philippine time)</small>
          <p>Photo review: {photo.review_status}</p>{photo.review_feedback && <p>{photo.review_feedback}</p>}
          {editable && <div className="photo-review-actions"><button type="button" disabled={busy} onClick={() => { setDate(day.date); setReplacement(photo.id); setCaption(photo.caption); input.current?.focus(); }}>Replace</button>
            <button type="button" disabled={busy} onClick={() => void run(() => service.remove(photo.id), "Photo removed from this revision; history retained.")}>Remove</button></div>}
          {reviewButtons("photo", photo.id)}
        </article>)}</div>
        {bundle.exceptions.filter(item => item.evidence_date === day.date).map(item => <article key={item.id} className="photo-exception">
          <strong>Exception: {item.status}</strong><p>{item.reason}</p>{item.review_feedback && <p>HTE feedback: {item.review_feedback}</p>}
          {reviewButtons("exception", item.id)}
        </article>)}
      </details>)}
      {editable && bundle.days.length > 0 && <div className="photo-authoring">
        <label className="field"><span>Activity date</span><select value={date} disabled={busy} onChange={event => { setDate(event.target.value); setReplacement(""); }}>
          {bundle.days.map(day => <option key={day.date} value={day.date}>{day.date}</option>)}
        </select></label>
        <label className="field"><span>{replacement ? "Replacement photo" : "Attach photo"}</span><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <small>JPEG, PNG or WebP. Up to 5 MB, at least 320 × 240 pixels. Maximum {bundle.policy?.max_photos_per_day ?? 1} photo(s) per day.</small>
        <label className="field"><span>Caption (optional)</span><input value={caption} maxLength={500} disabled={busy} onChange={event => setCaption(event.target.value)} /></label>
        <button type="button" className="button button-secondary" disabled={busy || !file || !date} onClick={() => void run(async () => {
          if (!file) return; await service.upload(log.id, date, file, caption, replacement);
          setFile(null); setCaption(""); setReplacement(""); if (input.current) input.current.value = "";
        }, "Photo attached.")}>{busy ? "Saving…" : replacement ? "Upload replacement" : "Upload photo"}</button>
        {replacement && <button type="button" onClick={() => setReplacement("")}>Cancel replacement</button>}
        <label className="field"><span>Cannot take a photo? Request an exception for {date}</span><textarea value={reason} minLength={10} maxLength={1000} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="Explain the workplace restriction or other reason." /></label>
        <button type="button" className="button button-secondary" disabled={busy || reason.trim().length < 10} onClick={() => void run(() => service.requestException(log.id, date, reason), "Exception requested. You may submit for review while the decision is pending.")}>Request exception</button>
      </div>}
      {bundle.photos.some(photo => photo.state !== "current") && <details><summary>Previous photo revisions</summary>{bundle.photos.filter(photo => photo.state !== "current").map(photo => <p key={photo.id}>{photo.evidence_date} · {photo.state} · {photo.caption || "No caption"} {photo.signedUrl && <a href={photo.signedUrl} target="_blank" rel="noopener noreferrer">View preserved photo</a>}</p>)}</details>}
      {bundle.history.length > 0 && <details><summary>Evidence review and change history</summary>
        <ol>{bundle.history.map(event => <li key={event.id}>
          <p>{event.entity_type.replaceAll("_", " ")} · {event.action.replaceAll("_", " ")}</p>
          <small>{new Date(event.occurred_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Philippine time)</small>
          {event.reason && <p>{event.reason}</p>}
        </li>)}</ol>
      </details>}
    </>}
  </section>;
}

export function HtePhotoPolicy() {
  const [policy, setPolicy] = useState<PhotoPolicy | null>(null);
  const [mode, setMode] = useState("optional");
  const [limit, setLimit] = useState(1);
  const [apply, setApply] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  useEffect(() => { let active = true; void service.policy().then(value => {
    if (active) { setPolicy(value); setMode(value.requirement_mode); setLimit(value.max_photos_per_day); }
  }).catch(() => { if (active) setMessage("Photo policy configuration is not available yet."); }); return () => { active = false; }; }, []);
  async function savePolicy() {
    setBusy(true); setMessage("");
    try {
      await service.savePolicy(mode, limit, apply, reason);
      setPolicy(await service.policy());
      setApply(false); setReason(""); setEditing(false); setConfirmApply(false);
      setMessage("Organization photo policy saved. Existing submitted and historical Weekly Logs are unchanged.");
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : "Policy could not be saved.");
    } finally { setBusy(false); }
  }
  return <section className="card photo-policy-card">
    <div className="card-title"><div><h2>Current Activity Photo Policy</h2>
      <p>{policy?.hte_name ?? "Your organization"}</p></div>
      {policy && <button type="button" className="button button-secondary" onClick={() => {
        setMode(policy.requirement_mode); setLimit(policy.max_photos_per_day);
        setApply(false); setReason(""); setConfirmApply(false); setEditing(true);
      }}>Configure / Update Policy</button>}
    </div>
    {policy && <dl className="info-list photo-policy-summary">
      <div><dt>Requirement</dt><dd>{policy.requirement_mode === "required" ? "Required daily" : "Optional"}</dd></div>
      <div><dt>Maximum photos per day</dt><dd>{policy.max_photos_per_day}</dd></div>
      <div><dt>Effective scope</dt><dd>Future Weekly Logs for this HTE organization</dd></div>
    </dl>}
    <p className="photo-policy-note">Policy changes apply to future logs. Existing submitted and historical Weekly Log requirements stay unchanged.</p>
    {message && <p role="status">{message}</p>}
    {policy && editing && <div className="photo-policy-editor" onChange={() => setConfirmApply(false)}><h3>Update photo policy</h3><div className="two-fields">
      <label className="field"><span>Requirement</span><select disabled={busy} value={mode} onChange={event => setMode(event.target.value)}><option value="optional">Optional</option><option value="required">Required daily</option></select></label>
      <label className="field"><span>Maximum photos per day</span><input disabled={busy} type="number" min={1} max={5} value={limit} onChange={event => setLimit(Number(event.target.value))} /></label>
    </div><label><input disabled={busy} type="checkbox" checked={apply} onChange={event => setApply(event.target.checked)} /> Apply to future logs of {policy.affected_active_assignments ?? 0} current active assignments</label>
    <label className="field"><span>Reason for change</span><textarea disabled={busy} minLength={10} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
    {confirmApply && <p className="form-warning" role="status">Review: {mode === "required" ? "Required daily" : "Optional"}, up to {limit} photos per day. {apply ? `Applies to future logs of ${policy.affected_active_assignments ?? 0} matching active assignments.` : "Applies to future assignments."} Existing submitted and historical logs will not change.</p>}
    <div className="modal-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => {
      setEditing(false); setApply(false); setReason(""); setConfirmApply(false);
    }}>Cancel</button>
    <button type="button" className="button button-secondary" disabled={busy} onClick={() => { setMode(policy.requirement_mode); setLimit(policy.max_photos_per_day); setApply(false); setReason(""); setConfirmApply(false); }}>Reset</button>
    <button type="button" className="button button-primary" disabled={busy || reason.trim().length < 10 || !Number.isInteger(limit) || limit < 1 || limit > 5} onClick={() => {
      if (!confirmApply) { setConfirmApply(true); return; }
      void savePolicy();
    }}>{busy ? "Saving…" : !confirmApply ? "Review changes" : "Confirm and save policy"}</button></div></div>}
  </section>;
}

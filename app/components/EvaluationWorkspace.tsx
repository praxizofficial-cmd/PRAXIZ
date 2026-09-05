"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/supabase-auth';
import { hasPermission } from '../permissions';
import { evaluationService, type EvaluationRecord, type EvaluationCriterionRecord, type EvaluationAssignment } from '../services/praxiz-services';
import type { EvaluationFormMetadata } from '../../lib/evaluation-report';
import type { RoleId } from '../types';
import { userError } from '../../lib/user-error';
import { Dialog } from './Dialog';
import { EvaluationPdfDownload } from './EvaluationPdfDownload';

type Template = { id: string; name: string; criteria: EvaluationCriterionRecord[]; metadata: EvaluationFormMetadata | null };

function RatingSections({ criteria, metadata, onChange }: { criteria: EvaluationCriterionRecord[]; metadata: EvaluationFormMetadata | null; onChange?: (id: string, score: number) => void }) {
  const sections = [...new Set(criteria.map(item => item.section || 'Evaluation criteria'))];
  return <>{sections.map(section => <section className="evaluation-section" key={section}><h3>{section}</h3>
    {[...new Set(criteria.filter(item => (item.section || 'Evaluation criteria') === section).map(item => item.group || ''))].map(group => <div key={group}>
      {group && <h4>{group}</h4>}
      {criteria.filter(item => (item.section || 'Evaluation criteria') === section && (item.group || '') === group).map(criterion => <div className="rating-row" key={criterion.id}>
        <div><strong id={`${onChange ? "edit" : "view"}-criterion-${criterion.id}`}>{criterion.label}</strong>{criterion.description && <p>{criterion.description}</p>}</div>
        {onChange ? <fieldset className="rating-options" aria-labelledby={`edit-criterion-${criterion.id}`}><legend className="sr-only">Choose a rating</legend>
          {metadata?.scoringMethod === 'individual' ? Array.from({ length: criterion.maximumScore - criterion.minimumScore + 1 }, (_, i) => criterion.maximumScore - i).map(score => <label className={criterion.score === score ? 'rating-selected' : ''} key={score} title={metadata?.scale[String(score)] || String(score)}>
            <input type="radio" name={`rating-${criterion.id}`} value={score} checked={criterion.score === score} onChange={() => onChange(criterion.id, score)} aria-label={`${score}${metadata?.scale[String(score)] ? ` — ${metadata.scale[String(score)]}` : ''}`} /><span>{score}</span>
          </label>) : <input aria-label={`Rating for ${criterion.label}`} type="number" step="any" min={criterion.minimumScore} max={criterion.maximumScore} value={Number.isFinite(criterion.score) ? criterion.score : ''} onChange={event => onChange(criterion.id, event.target.value === '' ? Number.NaN : Number(event.target.value))} />}<small>{Number.isFinite(criterion.score) ? metadata?.scale[String(criterion.score)] || `${criterion.score} selected` : 'Not rated'}</small></fieldset>
          : <p className="rating-result">{Number.isFinite(criterion.score) ? <><strong>{criterion.score} / {criterion.maximumScore}</strong><span>{metadata?.scale[String(criterion.score)]}</span></> : 'Not rated'}</p>}
      </div>)}
    </div>)}
  </section>)}</>;
}

function EvaluationEditor({ record, template, assignments, onClose, onSaved }: { record: EvaluationRecord | null; template: Template; assignments: EvaluationAssignment[]; onClose: () => void; onSaved: (message: string) => void }) {
  const [criteria, setCriteria] = useState(record?.criteria ?? template.criteria);
  const [assignmentId, setAssignmentId] = useState(record?.assignmentId ?? '');
  const [context, setContext] = useState(record?.context ?? {});
  const [remarks, setRemarks] = useState(record?.overallRemarks ?? '');
  const [strengths, setStrengths] = useState(record?.strengths ?? '');
  const [areas, setAreas] = useState(record?.areasForImprovement ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const metadata = record?.metadata ?? template.metadata;
  const complete = !!assignmentId && criteria.length > 0 && criteria.every(c => Number.isFinite(c.score) && (metadata?.scoringMethod !== 'individual' || Number.isInteger(c.score)) && c.score >= c.minimumScore && c.score <= c.maximumScore) && (!metadata || !!context.ratingPeriod?.trim());
  async function save(submit: boolean) {
    if (lock.current || !assignmentId || (submit && !complete)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await evaluationService.save({ id: record?.id, templateId: record?.templateId ?? template.id, assignmentId, criteria, context, strengths, areasForImprovement: areas, overallRemarks: remarks, submit });
      onSaved(submit ? 'Evaluation submitted for coordinator review.' : 'Evaluation draft saved.');
    } catch (reason) { setError(userError(reason)); } finally { lock.current = false; setBusy(false); setConfirmSubmit(false); }
  }
  return <Dialog title={record ? 'Edit evaluation' : 'Evaluate intern'} onClose={onClose} busy={busy} wide>
    <header className="official-form-heading"><h3>{record?.templateName ?? template.name}</h3>{metadata && <p>{metadata.formCode} · Rev. No. {metadata.revision} · Effective {metadata.effectivityDate}</p>}</header>
    {record?.status === 'Returned' && <div className="evaluation-feedback"><strong>Returned for revision</strong><p>{record.reviewFeedback}</p></div>}
    <div className="two-fields"><label className="field"><span>Student intern</span><select value={assignmentId} disabled={!!record || busy} onChange={e => setAssignmentId(e.target.value)}><option value="">Select your assigned intern</option>{record && !assignments.some(a => a.id === record.assignmentId) && <option value={record.assignmentId}>{record.studentName}</option>}{assignments.map(a => <option value={a.id} key={a.id}>{a.studentName}</option>)}</select></label>
      <label className="field"><span>Rating period {metadata ? '(required)' : '(optional)'}</span><input maxLength={160} value={context.ratingPeriod ?? ''} onChange={e => setContext({ ...context, ratingPeriod: e.target.value })} placeholder="e.g. August 1–31, 2026" /></label></div>
    {metadata && <div className="rating-guide"><p>{metadata.direction}</p><dl>{[5,4,3,2,1].map(n => <div key={n}><dt>{n}</dt><dd>{metadata.scale[String(n)]}</dd></div>)}</dl></div>}
    <RatingSections criteria={criteria} metadata={metadata} onChange={(id, score) => setCriteria(previous => previous.map(c => c.id === id ? { ...c, score } : c))} />
    <label className="field"><span>Remarks</span><textarea maxLength={10000} value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
    {!metadata && <div className="two-fields"><label className="field"><span>Strengths</span><textarea value={strengths} onChange={e => setStrengths(e.target.value)} /></label><label className="field"><span>Areas for improvement</span><textarea value={areas} onChange={e => setAreas(e.target.value)} /></label></div>}
    <div className="two-fields"><label className="field"><span>Rater designation (optional)</span><input maxLength={160} value={context.designation ?? ''} onChange={e => setContext({ ...context, designation: e.target.value })} /></label><label className="field"><span>Office (optional)</span><input maxLength={250} value={context.office ?? ''} onChange={e => setContext({ ...context, office: e.target.value })} /></label></div>
    <p className="muted-note">{criteria.filter(c => Number.isFinite(c.score)).length} of {criteria.length} criteria rated. Drafts remain private to authorized reviewers.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="button button-secondary" disabled={busy || !assignmentId} onClick={() => void save(false)}>Save draft</button><button className="button button-primary" disabled={busy || !complete} onClick={() => setConfirmSubmit(true)}>{busy ? 'Saving…' : 'Submit evaluation'}</button></div>
    {confirmSubmit && <Dialog title="Submit evaluation?" busy={busy} onClose={() => setConfirmSubmit(false)}><p>Your answers will be locked while the coordinator reviews this version.</p><div className="modal-actions"><button className="button button-secondary" disabled={busy} onClick={() => setConfirmSubmit(false)}>Cancel</button><button className="button button-primary" disabled={busy} onClick={() => void save(true)}>Confirm submission</button></div></Dialog>}
  </Dialog>;
}

export function EvaluationWorkspace({ role }: { role: RoleId }) {
  const { user } = useAuth();
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [template, setTemplate] = useState<Template | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [editor, setEditor] = useState<EvaluationRecord | null | undefined>();
  const [action, setAction] = useState<{ record: EvaluationRecord; kind: 'delete' | 'finalized' | 'returned' } | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const lock = useRef(false); const student = role === 'student';
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await evaluationService.listLive(); setRecords(student ? rows.filter(r => r.status === 'Finalized') : rows);
      if (!student && hasPermission(role, 'evaluations:score')) {
        setAssignments(await evaluationService.listAssignments());
        const options = await evaluationService.listActiveTemplates(role === 'hte' ? 'hte' : 'coordinator');
        setTemplates(options); setTemplate(options[0] ?? null);
      }
    } catch (reason) { setError(userError(reason)); } finally { setLoading(false); }
  }, [student, role]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function act() {
    if (!action || lock.current || (action.kind === 'returned' && !feedback.trim())) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (action.kind === 'delete') await evaluationService.deleteDraft(action.record.id);
      else await evaluationService.review(action.record.id, action.kind, feedback);
      setNotice(action.kind === 'delete' ? 'Draft deleted. Its audit history is retained.' : action.kind === 'finalized' ? 'Evaluation finalized. The student can now view the report.' : 'Evaluation returned with your feedback.');
      setAction(null); setFeedback(''); await load();
    } catch (reason) { setError(userError(reason)); } finally { lock.current = false; setBusy(false); }
  }
  const detail = records.find(r => r.id === selected);
  return <><div className="page-heading"><div><h1>Evaluations</h1><p>{student ? 'View and download your finalized internship reports.' : 'Evaluate assigned interns and track coordinator review.'}</p></div>{!student && template && assignments.length > 0 && <button className="button button-primary" onClick={() => setEditor(null)}><Plus size={18} />Evaluate intern</button>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="inline-success" role="status">{notice}</p>}
    {!student && templates.length > 1 && <label className="field"><span>Form for a new evaluation</span><select value={template?.id || ''} onChange={e => setTemplate(templates.find(t => t.id === e.target.value) ?? null)}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.metadata ? ' · Official PSU form' : ''}</option>)}</select></label>}
    {!student && !loading && !template && <p className="muted-note">No active evaluation template is available for your evaluator role. Existing records remain available below.</p>}
    {loading ? <div className="card page-skeleton" role="status" aria-label="Loading evaluations"><span /><span /><span /></div> : !records.length ? <section className="card empty-action"><h2>{student ? 'No finalized evaluations yet' : 'No evaluations yet'}</h2><p>{student ? 'Your report will appear after coordinator finalization.' : 'Evaluations for your authorized assignments will appear here.'}</p></section> : <section className="card table-card"><div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Evaluation</th><th>Evaluator</th><th>Status</th><th>Actions</th></tr></thead><tbody>{records.map(r => <tr key={r.id}><td>{r.studentName}</td><td>{r.templateName}</td><td>{r.evaluatorName}</td><td>{r.status}</td><td><div className="inline-actions"><button className="table-link" onClick={() => setSelected(r.id)}><Eye size={16} /> View report</button>{r.status === 'Finalized' && <EvaluationPdfDownload id={r.id} />}{!student && r.evaluatorId === user?.id && ['Draft','Returned'].includes(r.status) && <button className="table-link" onClick={() => setEditor(r)}>Edit</button>}{!student && r.evaluatorId === user?.id && <button className="table-link" disabled={r.status !== 'Draft'} title={r.status !== 'Draft' ? 'Only draft evaluations can be deleted. Submitted and finalized records are retained.' : 'Delete your draft'} onClick={() => setAction({ record: r, kind: 'delete' })}><Trash2 size={16} />Delete</button>}</div></td></tr>)}</tbody></table></div></section>}
    {detail && <section className="card evaluation-report"><header className="official-form-heading"><h2>{detail.templateName}</h2><p>{detail.studentName} · {detail.status}</p>{detail.metadata && <p>{detail.metadata.formCode} · Rev. No. {detail.metadata.revision} · {detail.metadata.effectivityDate}</p>}</header><dl className="report-identity"><div><dt>Rating period</dt><dd>{detail.context.ratingPeriod || 'Not recorded'}</dd></div><div><dt>Rater</dt><dd>{detail.evaluatorName}</dd></div></dl><RatingSections criteria={detail.criteria} metadata={detail.metadata} /><h3>Remarks</h3><p className="preserve-text">{detail.overallRemarks || 'No remarks recorded.'}</p>{detail.status === 'Returned' && <><h3>Coordinator feedback</h3><p>{detail.reviewFeedback}</p></>}{detail.status === 'Finalized' && <EvaluationPdfDownload id={detail.id} />}{!student && hasPermission(role, 'evaluations:finalize') && detail.status === 'Submitted' && <div className="modal-actions"><button className="button button-secondary" onClick={() => setAction({ record: detail, kind: 'returned' })}>Return for revision</button><button className="button button-primary" onClick={() => setAction({ record: detail, kind: 'finalized' })}>Finalize evaluation</button></div>}</section>}
    {editor !== undefined && <EvaluationEditor record={editor} template={editor ? { id: editor.templateId, name: editor.templateName, metadata: editor.metadata, criteria: editor.criteria } : template!} assignments={assignments} onClose={() => setEditor(undefined)} onSaved={message => { setNotice(message); setEditor(undefined); void load(); }} />}
    {action && <Dialog title={action.kind === 'delete' ? 'Delete this draft?' : action.kind === 'finalized' ? 'Finalize this evaluation?' : 'Return for revision'} onClose={() => setAction(null)} busy={busy}><p>{action.kind === 'delete' ? 'The draft will be removed from active lists. Its history is retained for audit.' : action.kind === 'finalized' ? 'The report will become read-only and available to the student. Finalized evaluations cannot be edited or deleted.' : 'Explain the revisions the evaluator needs to make.'}</p>{action.kind === 'returned' && <label className="field"><span>Feedback (required)</span><textarea value={feedback} onChange={e => setFeedback(e.target.value)} /></label>}{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button-secondary" disabled={busy} onClick={() => setAction(null)}>Cancel</button><button className={`button ${action.kind === 'delete' ? 'button-danger' : 'button-primary'}`} disabled={busy || (action.kind === 'returned' && !feedback.trim())} onClick={() => void act()}>{busy ? 'Saving…' : 'Confirm'}</button></div></Dialog>}
  </>;
}

export type ComplianceRow = { required_documents: number; satisfied_documents: number; submitted_documents: number; under_review_documents: number; missing_documents: number; needs_revision_documents: number; rejected_documents: number };
// The secured view excludes optional documents. Each required document belongs to one segment.
export function summarizeCompliance(rows: ComplianceRow[]) {
  const complete = rows.reduce((n, row) => n + Number(row.satisfied_documents), 0);
  const pending = rows.reduce((n, row) => n + Number(row.submitted_documents) + Number(row.under_review_documents), 0);
  const missing = rows.reduce((n, row) => n + Number(row.missing_documents) + Number(row.needs_revision_documents) + Number(row.rejected_documents), 0);
  const total = rows.reduce((n, row) => n + Number(row.required_documents), 0);
  if (complete + pending + missing !== total) throw new Error('Document statuses do not match the required-document total. Please contact an administrator.');
  const endComplete = total ? complete / total * 100 : 0;
  const endPending = total ? (complete + pending) / total * 100 : 0;
  return { complete, pending, missing, total, background: total ? `conic-gradient(var(--success) 0% ${endComplete}%, var(--warning) ${endComplete}% ${endPending}%, var(--danger) ${endPending}% 100%)` : 'var(--line)' };
}

const successTerms = ['approved', 'verified', 'active', 'complete', 'completed', 'resolved', 'available', 'good'];
const dangerTerms = ['rejected', 'failed', 'flagged'];
const warningTerms = ['attention', 'revision', 'returned', 'pending', 'unread', 'missing', 'requires action', 'monitor'];
const infoTerms = ['read', 'submitted', 'under review', 'draft', 'published', 'configured'];

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = dangerTerms.some(term => normalized.includes(term)) ? 'danger'
    : warningTerms.some(term => normalized.includes(term)) ? 'warning'
      : successTerms.some(term => normalized.includes(term)) ? 'success'
        : infoTerms.some(term => normalized.includes(term)) ? 'info' : 'info';
  return <span className={`badge badge-${tone}`}>{status}</span>;
}

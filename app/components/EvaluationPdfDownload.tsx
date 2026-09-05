"use client";
import { useRef, useState } from 'react';
import { Download } from 'lucide-react';

export function EvaluationPdfDownload({ id }: { id: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function download() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setFailed(false);
    try {
      const response = await fetch(`/api/evaluations/${id}/pdf`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
        throw new Error(response.status === 401 ? 'Your session expired. Sign in again to download the report.' : response.status === 404 ? 'This finalized report is not available to your account.' : 'The PDF could not be generated. Please try again.');
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `praxiz-evaluation-${id}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage('PDF ready. Download started.');
    } catch (reason) { setFailed(true); setMessage(reason instanceof Error ? reason.message : 'The PDF download failed. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <span className="pdf-download"><button className="table-link" disabled={busy} onClick={() => void download()}><Download size={16} />{busy ? 'Generating PDF…' : 'Download PDF'}</button>{message && <small className={failed ? 'form-error' : 'muted-note'} role={failed ? 'alert' : 'status'}>{message}</small>}</span>;
}

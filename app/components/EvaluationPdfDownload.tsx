"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Eye } from 'lucide-react';
import { Dialog } from './Dialog';

export function EvaluationPdfDownload({ id, studentName }: { id: string; studentName: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function load(action: 'view' | 'download') {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setFailed(false);
    try {
      let nextUrl = url;
      if (!nextUrl) {
        const response = await fetch(`/api/evaluations/${id}/pdf`, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
          throw new Error(response.status === 401 ? 'Your session expired. Sign in again to view this report.' : response.status === 404 ? 'This finalized report is not available to your account.' : 'The PDF could not be generated. Please try again.');
        }
        nextUrl = URL.createObjectURL(await response.blob());
        setUrl(nextUrl);
      }
      if (action === 'view') {
        setOpen(true);
      } else {
        const anchor = document.createElement('a');
        const safeName = studentName.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'student';
        anchor.href = nextUrl;
        anchor.download = `praxiz-finalized-evaluation-${safeName}.pdf`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setMessage('Finalized evaluation PDF downloaded.');
      }
    } catch (reason) { setFailed(true); setMessage(reason instanceof Error ? reason.message : 'The PDF download failed. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <span className="pdf-download" aria-label="Official PDF"><span className="inline-actions"><button type="button" className="table-link" disabled={busy} onClick={() => void load('view')}><Eye size={16} />{busy ? 'Preparing PDF…' : 'View PDF'}</button><button type="button" className="table-link" disabled={busy} onClick={() => void load('download')}><Download size={16} />Download</button></span>{message && <small className={failed ? 'form-error' : 'muted-note'} role={failed ? 'alert' : 'status'}>{message}</small>}{open && url && <Dialog title="Finalized evaluation PDF" wide protectChanges={false} onClose={() => setOpen(false)}><div className="pdf-viewer-toolbar"><p>This read-only PDF is the finalized version released by the Internship Coordinator.</p><a className="button button-secondary" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />Open in new tab</a><a className="button button-secondary" href={url} download={`praxiz-finalized-evaluation-${id}.pdf`}><Download size={17} />Download PDF</a></div><iframe className="evaluation-pdf-frame" src={url} title="Finalized official evaluation PDF" /></Dialog>}</span>;
}

"use client";
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Eye } from 'lucide-react';
import { Dialog } from './Dialog';

export function EvaluationPdfDownload({ id }: { id: string; studentName: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function load() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setFailed(false);
    try {
      const response = await fetch(`/api/evaluations/${id}/pdf`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
        throw new Error(response.status === 401 ? 'Your session expired. Sign in again to download the report.' : response.status === 404 ? 'This finalized report is not available to your account.' : 'The PDF could not be generated. Please try again.');
      }
      if (url) URL.revokeObjectURL(url);
      const nextUrl = URL.createObjectURL(await response.blob());
      setUrl(nextUrl); setOpen(true);
    } catch (reason) { setFailed(true); setMessage(reason instanceof Error ? reason.message : 'The PDF download failed. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <span className="pdf-download"><button className="table-link" disabled={busy} onClick={() => void load()}><Eye size={16} />{busy ? 'Preparing PDF…' : 'View PDF'}</button>{message && <small className={failed ? 'form-error' : 'muted-note'} role={failed ? 'alert' : 'status'}>{message}</small>}{open && url && <Dialog title="Official evaluation PDF" wide protectChanges={false} onClose={() => setOpen(false)}><div className="pdf-viewer-toolbar"><p>Use the PDF viewer toolbar to print or download the finalized report.</p><a className="button button-secondary" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />Open in new tab</a></div><iframe className="evaluation-pdf-frame" src={url} title="Official PSU-F-PLU-02 evaluation PDF" /></Dialog>}</span>;
}

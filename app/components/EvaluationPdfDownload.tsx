"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Eye, Printer } from 'lucide-react';
import { Dialog } from './Dialog';

export function EvaluationPdfDownload({ id }: { id: string }) {
  const lock = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
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
  function download() {
    if (!url) return;
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `praxiz-evaluation-${id}.pdf`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }
  return <span className="pdf-download"><button className="table-link" disabled={busy} onClick={() => void load()}><Eye size={16} />{busy ? 'Preparing PDF…' : 'View PDF'}</button>{message && <small className={failed ? 'form-error' : 'muted-note'} role={failed ? 'alert' : 'status'}>{message}</small>}{open && url && <Dialog title="Official evaluation PDF" wide protectChanges={false} onClose={() => setOpen(false)}><div className="pdf-viewer-toolbar" role="toolbar" aria-label="PDF actions"><button className="button button-secondary" onClick={() => frame.current?.contentWindow?.print()}><Printer size={17} />Print</button><button className="button button-secondary" onClick={download}><Download size={17} />Download</button><a className="button button-secondary" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />Open<span className="sr-only"> in a new tab</span></a></div><iframe ref={frame} className="evaluation-pdf-frame" src={url} title="Official PSU-F-PLU-02 evaluation PDF" /></Dialog>}</span>;
}

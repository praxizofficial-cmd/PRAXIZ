"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Eye, Printer } from 'lucide-react';
import { Dialog } from './Dialog';

export function EvaluationPdfDownload({ id, studentName }: { id: string; studentName: string }) {
  const lock = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [confirmation, setConfirmation] = useState<'print' | 'download' | null>(null);
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
    setConfirmation(null);
  }
  function print() { frame.current?.contentWindow?.print(); setConfirmation(null); }
  return <span className="pdf-download"><button className="table-link" disabled={busy} onClick={() => void load()}><Eye size={16} />{busy ? 'Preparing PDF…' : 'View PDF'}</button>{message && <small className={failed ? 'form-error' : 'muted-note'} role={failed ? 'alert' : 'status'}>{message}</small>}{open && url && <Dialog title="Official evaluation PDF" wide protectChanges={false} onClose={() => setOpen(false)}><div className="pdf-viewer-toolbar" role="toolbar" aria-label="PDF actions"><button className="button button-secondary" onClick={() => setConfirmation('print')}><Printer size={17} />Print</button><button className="button button-secondary" onClick={() => setConfirmation('download')}><Download size={17} />Download</button><a className="button button-secondary" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />Open in new tab</a></div><iframe ref={frame} className="evaluation-pdf-frame" src={url} title="Official PSU-F-PLU-02 evaluation PDF" />{confirmation === 'print' && <Dialog title="Print evaluation PDF?" protectChanges={false} onClose={() => setConfirmation(null)}><p>You are about to print the finalized evaluation for <strong>{studentName}</strong>.</p><div className="modal-actions"><button className="button button-secondary" onClick={() => setConfirmation(null)}>Cancel</button><button className="button button-primary" onClick={print}>Print</button></div></Dialog>}{confirmation === 'download' && <Dialog title="Download evaluation PDF?" protectChanges={false} onClose={() => setConfirmation(null)}><p>A copy of this finalized evaluation will be saved to your device.</p><div className="modal-actions"><button className="button button-secondary" onClick={() => setConfirmation(null)}>Cancel</button><button className="button button-primary" onClick={download}>Download</button></div></Dialog>}</Dialog>}</span>;
}

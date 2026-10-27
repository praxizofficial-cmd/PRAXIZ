"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { TriangleAlert, X, Maximize2, Minimize2 } from 'lucide-react';

export function Dialog({ title, children, onClose, busy = false, wide = false, expandable = false, footer, protectChanges = true, className = "" }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean; expandable?: boolean; footer?: ReactNode; protectChanges?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const baseline = useRef<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [expanded, setExpanded] = useState(false);
  function snapshot() {
    return JSON.stringify(Array.from(ref.current?.querySelectorAll('input,select,textarea') ?? []).map(node => {
      const field = node as HTMLInputElement;
      return [field.name, field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value];
    }));
  }
  function requestClose() {
    if (busy) return;
    if (protectChanges && baseline.current !== null && baseline.current !== snapshot()) setConfirmDiscard(true);
    else onClose();
  }
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const initialFocus = dialog?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button:not(.dialog-close)') ?? dialog?.querySelector<HTMLElement>('.dialog-close');
    const frame = requestAnimationFrame(() => initialFocus?.focus());
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const unload = (event: BeforeUnloadEvent) => {
      if (protectChanges && baseline.current !== null && baseline.current !== JSON.stringify(Array.from(dialog?.querySelectorAll('input,select,textarea') ?? []).map(node => {
        const field = node as HTMLInputElement;
        return [field.name, field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value];
      }))) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', unload);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('beforeunload', unload); dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [protectChanges]);
  return <dialog ref={ref} className={`native-dialog ${wide ? 'native-dialog-wide' : ''} ${expandable ? 'native-dialog-expandable' : ''} ${expanded ? 'native-dialog-expanded' : ''} ${className}`.trim()} aria-labelledby={titleId}
    onSubmitCapture={event => { if (busy) { event.preventDefault(); event.stopPropagation(); } }}
    onFocusCapture={event => { if (baseline.current === null && (event.target as HTMLElement).matches('input,select,textarea')) baseline.current = snapshot(); }}
    onClickCapture={event => {
      const button = (event.target as HTMLElement).closest('button');
      if (button && /^(cancel|close)$/i.test(button.textContent?.trim() ?? '')) { event.preventDefault(); event.stopPropagation(); requestClose(); }
    }}
    onCancel={event => { event.preventDefault(); requestClose(); }}>
    <div className="native-dialog-header"><h2 id={titleId}>{title}</h2><div className="dialog-header-actions">{expandable && <button type="button" className="icon-button" aria-label={expanded ? 'Restore dialog size' : 'Expand dialog'} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={20}/> : <Maximize2 size={20}/>}</button>}<button type="button" className="icon-button dialog-close" disabled={busy} onClick={requestClose} aria-label={`Close ${title}`}><X size={20} /></button></div></div>
    <div className="native-dialog-content" aria-busy={busy}>{children}</div>
    {footer && <div className="native-dialog-footer">{footer}</div>}
    {confirmDiscard && <Dialog title="Discard unsaved changes?" className="discard-dialog" protectChanges={false} onClose={() => setConfirmDiscard(false)}><div className="discard-dialog-message"><span aria-hidden="true"><TriangleAlert size={22} /></span><div><strong>Leave without saving?</strong><p>Your unsaved changes will be lost. Saved records and audit history are not affected.</p></div></div><div className="modal-actions"><button className="button button-secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button className="button button-danger" onClick={onClose}>Discard changes</button></div></Dialog>}
  </dialog>;
}

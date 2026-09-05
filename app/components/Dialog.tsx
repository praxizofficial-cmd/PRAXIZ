"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({ title, children, onClose, busy = false, wide = false, protectChanges = true }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean; protectChanges?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const baseline = useRef<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const unload = (event: BeforeUnloadEvent) => {
      if (protectChanges && baseline.current !== null && baseline.current !== JSON.stringify(Array.from(dialog?.querySelectorAll('input,select,textarea') ?? []).map(node => {
        const field = node as HTMLInputElement;
        return [field.name, field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value];
      }))) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('beforeunload', unload); dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [protectChanges]);
  return <dialog ref={ref} className={`native-dialog ${wide ? 'native-dialog-wide' : ''}`} aria-label={title}
    onFocusCapture={event => { if (baseline.current === null && (event.target as HTMLElement).matches('input,select,textarea')) baseline.current = snapshot(); }}
    onClickCapture={event => {
      const button = (event.target as HTMLElement).closest('button');
      if (button && /^(cancel|close)$/i.test(button.textContent?.trim() ?? '')) { event.preventDefault(); event.stopPropagation(); requestClose(); }
    }}
    onCancel={event => { event.preventDefault(); requestClose(); }}>
    <div className="native-dialog-header"><h2>{title}</h2><button className="icon-button" disabled={busy} onClick={requestClose} aria-label={`Close ${title}`}><X size={20} /></button></div>
    <div className="native-dialog-content" aria-busy={busy}>{children}</div>
    {confirmDiscard && <Dialog title="Discard unsaved changes?" protectChanges={false} onClose={() => setConfirmDiscard(false)}><p>Your changes have not been saved. Discarding them cannot be undone.</p><div className="inline-actions"><button className="button button-secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button className="button button-danger" onClick={onClose}>Discard changes</button></div></Dialog>}
  </dialog>;
}

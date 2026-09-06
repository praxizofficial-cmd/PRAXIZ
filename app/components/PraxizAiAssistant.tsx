'use client';

import { FormEvent, useState } from 'react';
import { Dialog } from './Dialog';

export default function PraxizAiAssistant() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = message.trim();

    if (!prompt || loading) {
      return;
    }

    setLoading(true);
    setError('');
    setAnswer('');

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || 'PRAXIZ AI could not process your request.'
        );
      }

      setAnswer(data?.response || 'No response was generated.');
    } catch (err) {
      console.error('PRAXIZ AI assistant request failed', err);
      setError('Unable to send your question. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return <>
    <button type="button" className="ai-assistant-trigger" onClick={() => setOpen(true)} aria-label="Open PRAXIZ AI Assistant" title="Open PRAXIZ AI Assistant">✦</button>
    {open && <Dialog title="PRAXIZ AI Assistant" onClose={() => setOpen(false)} busy={loading}>
      <p className="muted-note">Ask a question about the current PRAXIZ monitoring context or available internship information. AI responses may need verification.</p>
      <div className="ai-assistant-response" role="status" aria-live="polite" aria-busy={loading}>
        {loading ? <p>Asking PRAXIZ AI…</p> : answer && <><strong>PRAXIZ AI response</strong><p className="preserve-text">{answer}</p></>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form onSubmit={handleSubmit} aria-busy={loading}>
        <label className="field"><span>Your question</span><textarea required maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask PRAXIZ AI…" rows={3} disabled={loading} /></label>
        <div className="modal-actions"><button type="button" className="button button-secondary" disabled={loading} onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={loading || !message.trim()}>{loading ? 'Asking…' : 'Send'}</button></div>
      </form>
    </Dialog>}
  </>;
}

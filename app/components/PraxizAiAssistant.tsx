'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, RefreshCw, Send, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../auth/supabase-auth';
import type { RoleId } from '../types';
import { Dialog } from './Dialog';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };

const roleSuggestions: Record<RoleId, string[]> = {
  student: ['How do I submit a Weekly Log?', 'Where can I view my attendance?', 'How do I submit a required document?'],
  coordinator: ['Summarize the monitoring workflow', 'How do I review attendance?', 'Explain the evaluation workflow'],
  hte: ['How do I verify attendance?', 'How do I review an assigned intern?', 'How do I complete an evaluation?'],
  admin: ['How do I review registrations?', 'Explain role and scope assignment', 'How do I verify an HTE organization?'],
};

const roleActions: Record<RoleId, Array<{ pattern: RegExp; label: string; href: string }>> = {
  student: [
    { pattern: /attendance|time in|time out/i, label: 'Open attendance', href: '/student/attendance' },
    { pattern: /weekly log/i, label: 'Open Weekly Logs', href: '/student/weekly-logs' },
    { pattern: /document|requirement/i, label: 'Open documents', href: '/student/documents' },
  ],
  coordinator: [
    { pattern: /attendance/i, label: 'Review attendance', href: '/coordinator/attendance' },
    { pattern: /required hours|requirement setup/i, label: 'Open requirements', href: '/coordinator/requirements' },
    { pattern: /evaluation/i, label: 'Review evaluations', href: '/coordinator/evaluations' },
  ],
  hte: [
    { pattern: /attendance/i, label: 'Verify attendance', href: '/hte/attendance' },
    { pattern: /weekly log/i, label: 'Review Weekly Logs', href: '/hte/weekly-logs' },
    { pattern: /evaluation/i, label: 'Open evaluations', href: '/hte/evaluations' },
  ],
  admin: [
    { pattern: /registration/i, label: 'Review registrations', href: '/admin/registrations' },
    { pattern: /academic term|institutional/i, label: 'Open institutional data', href: '/admin/master-data' },
    { pattern: /hte/i, label: 'Open HTE verification', href: '/admin/hte-verification' },
  ],
};

export default function PraxizAiAssistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const conversationRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const role = user?.role ?? 'student';

  useEffect(() => {
    if (open) conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight });
  }, [messages, loading, open]);

  async function sendPrompt(prompt: string, history: ChatMessage[] = messages) {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    const pending = [...history, userMessage];
    setMessages(pending);
    setMessage('');
    if (composerRef.current) composerRef.current.style.height = '54px';
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: pending.slice(-12).map(({ role: messageRole, content }) => ({ role: messageRole, content })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'PRAXIZ AI could not process your request.');
      setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', content: data?.response || 'No response was generated.' }]);
    } catch (reason) {
      console.error('PRAXIZ AI assistant request failed', reason);
      setError(reason instanceof Error ? reason.message : 'Unable to send your question. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendPrompt(message);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function resizeComposer(value: string) {
    setMessage(value);
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = '0px';
    composer.style.height = `${Math.min(132, Math.max(54, composer.scrollHeight))}px`;
  }

  async function copyAnswer(item: ChatMessage) {
    await navigator.clipboard.writeText(item.content);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(current => current === item.id ? '' : current), 1800);
  }

  function regenerate(index: number) {
    const previousPrompt = messages.slice(0, index).reverse().find(item => item.role === 'user');
    if (!previousPrompt) return;
    const history = messages.slice(0, index).filter(item => item.id !== previousPrompt.id);
    setMessages(history);
    void sendPrompt(previousPrompt.content, history);
  }

  const suggestions = roleSuggestions[role];
  const contextualAction = (content: string) => roleActions[role].find(action => action.pattern.test(content));
  return <>
    <button type="button" className="ai-assistant-trigger" onClick={() => setOpen(true)} aria-label="Open PRAXIZ AI Assistant" title="Open PRAXIZ AI Assistant">✦</button>
    {open && <Dialog title="PRAXIZ AI Assistant" onClose={() => setOpen(false)} busy={loading} protectChanges={false} className="ai-chat-dialog">
      <div className="ai-chat-status"><Sparkles size={17} aria-hidden="true" /><span><strong>{role === 'hte' ? 'HTE Representative' : role === 'coordinator' ? 'Internship Coordinator' : role === 'admin' ? 'System Administrator' : 'Student Intern'}</strong> · trusted role context · AI responses may require verification</span></div>
      <div className="ai-chat-conversation" ref={conversationRef} aria-live="polite" aria-busy={loading}>
        {messages.length === 0 ? <div className="ai-chat-welcome">
          <span className="ai-chat-mark" aria-hidden="true">✦</span>
          <h3>How can I help with PRAXIZ?</h3>
          <p>Ask about the workflows available in your {role === 'hte' ? 'HTE Representative' : role === 'coordinator' ? 'Internship Coordinator' : role === 'admin' ? 'System Administrator' : 'Student Intern'} workspace.</p>
          <div className="ai-chat-suggestions" aria-label="Suggested questions">{suggestions.map(suggestion => <button type="button" key={suggestion} onClick={() => void sendPrompt(suggestion)}>{suggestion}</button>)}</div>
        </div> : messages.map((item, index) => <article key={item.id} className={`ai-chat-message ai-chat-message-${item.role}`}><span>{item.role === 'user' ? 'You' : 'PRAXIZ AI'}</span>{item.role === 'assistant' ? <><div className="ai-chat-markdown"><ReactMarkdown>{item.content}</ReactMarkdown></div><div className="ai-message-actions"><button type="button" onClick={() => void copyAnswer(item)}>{copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}{copiedId === item.id ? 'Copied' : 'Copy'}</button><button type="button" disabled={loading} onClick={() => regenerate(index)}><RefreshCw size={14} />Regenerate</button>{contextualAction(item.content) && <a href={contextualAction(item.content)!.href}><ExternalLink size={14} />{contextualAction(item.content)!.label}</a>}</div></> : <p>{item.content}</p>}</article>)}
        {loading && <article className="ai-chat-message ai-chat-message-assistant ai-chat-typing" role="status"><span>PRAXIZ AI</span><p aria-label="PRAXIZ AI is thinking"><i /><i /><i /></p></article>}
      </div>
      {error && <div className="ai-error" role="alert"><span>{error}</span><button type="button" className="table-link" onClick={() => void sendPrompt(messages.filter(item => item.role === 'user').at(-1)?.content ?? '')}>Retry</button></div>}
      <form className="ai-chat-composer" onSubmit={handleSubmit} aria-busy={loading}>
        <label htmlFor="praxiz-ai-message" className="sr-only">Message PRAXIZ AI</label>
        <textarea ref={composerRef} id="praxiz-ai-message" maxLength={4000} value={message} onChange={event => resizeComposer(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Message PRAXIZ AI…" rows={1} disabled={loading} />
        <button type="submit" className="button button-primary" aria-label="Send message" disabled={loading || !message.trim()}><Send size={18} /> <span>Send</span></button>
        <small>Enter to send · Shift+Enter for a new line</small>
      </form>
    </Dialog>}
  </>;
}

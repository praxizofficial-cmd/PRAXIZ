import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../app/PraxizApp.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../app/components/PraxizAiAssistant.tsx', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../app/components/PraxizLoaderMark.tsx', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../app/auth/supabase-auth.tsx', import.meta.url), 'utf8');
const evaluation = readFileSync(new URL('../app/components/EvaluationWorkspace.tsx', import.meta.url), 'utf8');
const statusBadge = readFileSync(new URL('../app/components/StatusBadge.tsx', import.meta.url), 'utf8');

test('V17 uses one theme-aware semantic badge system', () => {
  assert.match(app, /import \{ StatusBadge \} from "\.\/components\/StatusBadge"/);
  assert.match(statusBadge, /dangerTerms[\s\S]*rejected[\s\S]*failed/);
  assert.match(statusBadge, /warningTerms[\s\S]*attention[\s\S]*pending/);
  assert.match(css, /--status-danger-bg:/);
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--status-danger-fg:/);
});

test('coordinator intern management reuses authoritative section HTE and term data', () => {
  assert.match(app, /View by Section/);
  assert.match(app, /View by HTE/);
  assert.match(app, /Filter by academic term/);
  assert.match(app, /groupBy=\{role === "coordinator" \? viewBy : "all"\}/);
  assert.doesNotMatch(app, /mockSection|fakeSection/);
});

test('AI output uses safe Markdown and a viewport-aware conversation panel', () => {
  assert.match(ai, /import ReactMarkdown from 'react-markdown'/);
  assert.match(ai, /<ReactMarkdown>\{item\.content\}<\/ReactMarkdown>/);
  assert.doesNotMatch(ai, /dangerouslySetInnerHTML/);
  assert.match(css, /\.ai-chat-dialog[\s\S]*max-height:/);
  assert.match(css, /\.ai-chat-conversation[\s\S]*overflow-y: auto/);
});

test('major route loading uses animated PRAXIZ paths with reduced-motion fallback', () => {
  assert.match(loader, /loader-path-pink/);
  assert.match(loader, /loader-path-blue/);
  assert.match(loader, /loader-path-gold/);
  assert.match(auth, /<PraxizLoaderMark \/>/);
  assert.match(auth, /Preparing workspace…/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.loader-path/);
});

test('evaluation actions are separated and stack on phones', () => {
  assert.match(evaluation, /evaluation-editor-content/);
  assert.match(evaluation, /modal-actions evaluation-actions/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.evaluation-actions[\s\S]*grid-template-columns: 1fr/);
});

test('shared tables fill cards while retaining local horizontal scrolling', () => {
  assert.match(css, /\.table-card \{[^}]*overflow: hidden/);
  assert.match(css, /\.table-scroll \{[^}]*width: 100%[^}]*overflow-x: auto/);
  assert.match(css, /\.data-table \{[^}]*width: max-content[^}]*min-width: 100%/);
});

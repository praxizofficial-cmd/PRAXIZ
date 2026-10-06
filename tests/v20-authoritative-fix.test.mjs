import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../app/PraxizApp.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const service = readFileSync(new URL('../app/services/praxiz-services.ts', import.meta.url), 'utf8');

test('V20 reads year level and Section from the deployed student profile relation', () => {
  assert.match(service, /from\("student_profiles"\)\.select\("user_id,year_level,section"\)\.in\("user_id"/);
  assert.match(service, /\[profile\.user_id, profile\]/);
  assert.doesNotMatch(service, /from\("profiles"\)\.select\("id,year_level,section"\)/);
});

test('assignment and requirement empty states use the shared table surface', () => {
  assert.match(app, /emptyMessage=\{!loading && !error \? "No internship assignments/);
  assert.match(app, /className="table-empty" colSpan=\{5\}/);
  assert.match(styles, /\.data-table \.table-empty \{[^}]*text-align: center/);
});

test('V20 restores visible actions and full-height document previews', () => {
  assert.match(app, /<Eye size=\{16\} aria-hidden="true" \/>\s*View history/);
  assert.match(styles, /\.partner-hte-card \.inline-actions \{[^}]*gap: 10px/);
  assert.match(styles, /\.document-preview-dialog \{[^}]*width: min\(1160px, 92vw\);[^}]*height: min\(90dvh, 940px\)/);
  assert.match(styles, /\.document-preview-frame \{[^}]*flex: 1 1 0/);
});

test('V20 defines the authoritative palette and accessible derived accents', () => {
  for (const value of ['#E9B949', '#1E3A8A', '#F7D56B', '#FAFAF8', '#F1F5F9', '#2D2D2D', '#9CA3AF', '#22C55E', '#EF4444', '#3B82F6']) {
    assert.match(styles, new RegExp(value, 'i'));
  }
  assert.match(styles, /--gold-strong: #8A5A08/);
  assert.match(styles, /--navy-on-dark: #86A9FF/);
});

test('assistant Markdown is one visual response surface and Send remains white', () => {
  assert.match(styles, /ai-chat-message-assistant \.ai-chat-markdown p \{[\s\S]*?border: 0;[\s\S]*?background: transparent/);
  assert.match(styles, /ai-chat-composer \.button-primary,[\s\S]*?color: #ffffff/);
});

test('requirements control row and weekly summary use stable alignment', () => {
  assert.match(styles, /\.requirement-setup-form \.button \{[\s\S]*?height: var\(--control-height\);[\s\S]*?margin: 0/);
  assert.match(styles, /\.weekly-log-table \.summary-cell \{[^}]*vertical-align: middle/);
});

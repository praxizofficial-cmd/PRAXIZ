import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../app/PraxizApp.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const service = readFileSync(new URL('../app/services/praxiz-services.ts', import.meta.url), 'utf8');
const statusBadge = readFileSync(new URL('../app/components/StatusBadge.tsx', import.meta.url), 'utf8');
const history = readFileSync(new URL('../app/components/StudentAttendanceHistory.tsx', import.meta.url), 'utf8');

test('V19 centralizes the navy, biscotti, and light surface hierarchy', () => {
  assert.match(styles, /--navy-accent: #1e3a5f/);
  assert.match(styles, /--biscotti-accent: #d2b06f/);
  assert.match(styles, /--background: #f4f6fa/);
  assert.match(styles, /--surface-muted: #f8fafc/);
  assert.match(styles, /--line: #dce3ec/);
});

test('Weekly Log details and review share a structured record surface', () => {
  assert.match(app, /function WeeklyLogRecordContent/);
  assert.match(app, /title="Weekly Log Details"/);
  assert.match(app, /Coordinator feedback/);
  assert.match(app, /<Eye size=\{16\} \/>/);
  assert.match(app, /Review log <ChevronRight/);
  assert.match(app, /Reason \*/);
  assert.doesNotMatch(app, /title="View weekly log"/);
});

test('documents use an embedded secure preview and guarded re-upload actions', () => {
  assert.match(app, /function DocumentPreviewDialog/);
  assert.match(app, /document-preview-frame/);
  assert.match(app, /Open in new tab/);
  assert.match(app, /"Re-upload"/);
  assert.match(service, /async signedUrl/);
  assert.match(app, /aria-label=\{`Download \$\{record\.templateName\}`\}/);
});

test('status and attendance actions preserve distinct semantics', () => {
  assert.doesNotMatch(statusBadge, /successTerms = \[[^\]]*'read'/);
  assert.match(statusBadge, /infoTerms = \[[^\]]*'read'/);
  assert.match(app, /attendance-pair-notice/);
  assert.match(history, /<Download size=\{17\}/);
});

test('assigned intern profiles refresh year level and Section from authoritative profiles', () => {
  assert.match(service, /from\("student_profiles"\)\.select\("user_id,year_level,section"\)/);
  assert.match(service, /yearLevel: academicProfile\?\.year_level/);
  assert.match(service, /section: academicProfile\?\.section/);
});

test('toast placement avoids the bottom-right AI Assistant action', () => {
  assert.match(styles, /\.form-success\[role="status"\][\s\S]*inset: 92px 24px auto auto/);
});

test('compact authentication keeps appearance controls above the form card', () => {
  assert.match(styles, /\.auth-compact-header \{[^}]*position: relative;[^}]*z-index: 90;/);
  assert.match(styles, /\.auth-compact-main \{[^}]*position: relative;[^}]*z-index: 1;/);
});

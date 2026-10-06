import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../app/PraxizApp.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../app/components/PraxizAiAssistant.tsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../app/components/ProfileDetails.tsx', import.meta.url), 'utf8');
const analyticsRoute = readFileSync(new URL('../app/api/ai/analytics/route.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../database/20261003_v18_term_requirements_and_profile_section.sql', import.meta.url), 'utf8');
const institutionalBrowser = readFileSync(new URL('../app/components/InstitutionalBrowser.tsx', import.meta.url), 'utf8');
const evaluationWorkspace = readFileSync(new URL('../app/components/EvaluationWorkspace.tsx', import.meta.url), 'utf8');
const statusBadge = readFileSync(new URL('../app/components/StatusBadge.tsx', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../app/data.ts', import.meta.url), 'utf8');

test('academic terms stay editable until explicit finalization', () => {
  assert.match(migration, /configuration_status in \('draft', 'configured', 'finalized'\)/);
  assert.match(migration, /Finalized academic terms are read-only/);
  assert.match(migration, /create or replace function public\.finalize_academic_term/);
  assert.match(institutionalBrowser, /Edit dates/);
  assert.match(institutionalBrowser, /Finalize/);
});

test('required hours are scoped and assignment snapshots remain authoritative', () => {
  assert.match(migration, /internship_requirement_configs/);
  assert.match(migration, /academic_term_id, academic_program_id, section/);
  assert.doesNotMatch(migration, /update public\.internship_assignments[\s\S]*required_hours/);
  assert.match(app, /Required hours are not configured/);
  assert.match(app, /saveRequirementConfig/);
  assert.match(navigation, /Requirements Setup/);
  assert.match(app, /saveRequirementScope/);
  assert.match(app, /Existing assignments were not changed/);
});

test('Section A-E is editable and visible in reports and analytics', () => {
  assert.match(profile, /STUDENT_SECTION_OPTIONS/);
  assert.match(profile, /p_section/);
  assert.match(app, /\["Student", "Campus", "Program", "Section"/);
  assert.match(app, /\['section', 'By Section'\]/);
  assert.match(analyticsRoute, /student_profiles!inner\(section\)/);
  assert.match(analyticsRoute, /student_profiles\.section/);
});

test('AI assistant uses a bounded conversational layout and integrated actions', () => {
  assert.doesNotMatch(ai, /<textarea[^>]+required/);
  assert.match(ai, /copyAnswer/);
  assert.match(ai, /regenerate/);
  assert.match(ai, /trusted role context/);
  assert.match(ai, /contextualAction/);
  assert.match(styles, /height: min\((?:86dvh, 820px|720px, calc\(100dvh - 32px\))\)/);
  assert.match(styles, /max-height: 132px/);
  assert.match(styles, /ai-chat-typing i/);
});

test('attendance and Weekly Log review surfaces use theme tokens and structured regions', () => {
  assert.match(styles, /readonly-event-grid > div/);
  assert.match(styles, /background: color-mix\(in srgb, var\(--surface\)/);
  assert.match(app, /WeeklyLogRecordContent/);
  assert.match(app, /weekly-log-record-sections/);
  assert.match(app, /Reject Weekly Log\?/);
  assert.match(styles, /form-success\[role="status"\]/);
  assert.match(evaluationWorkspace, /<StatusBadge status=\{r\.status\}/);
  assert.match(statusBadge, /missing/);
  assert.doesNotMatch(statusBadge, /successTerms = \[[^\]]*finalized/);
});

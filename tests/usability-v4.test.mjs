import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { activeRoleCodes, resolveRoleCode } from '../app/auth/student-stabilization.ts';
import { supportedRoleCodes, supportedRoleNames } from '../app/auth/supported-roles.ts';
import { userError } from '../lib/user-error.ts';

const source = readFileSync(new URL('../app/PraxizApp.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const services = readFileSync(new URL('../app/services/praxiz-services.ts', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

test('retired and unknown roles never resolve a workspace, including preferred roles', () => {
  const assignment = code => ({ code, startsAt: null, endsAt: null, deletedAt: null });
  assert.equal(supportedRoleCodes.length, 4);
  assert.equal(supportedRoleNames.hte_supervisor, 'HTE Representative');
  assert.deepEqual(activeRoleCodes([assignment('faculty_supervisor'), assignment('unknown')]), []);
  assert.equal(resolveRoleCode([assignment('faculty_supervisor')], 'faculty_supervisor'), undefined);
  assert.equal(resolveRoleCode([assignment('faculty_supervisor'), assignment('student_intern')], 'faculty_supervisor'), 'student_intern');
  assert.match(services, /\.in\("code", \[\.\.\.supportedRoleCodes\]\)/);
});

test('identity cells do not embed intern view or attendance history actions', () => {
  const interns = section('function InternTable(', 'function AttendanceReviewDialog(');
  assert.match(interns, /onView && <th>Actions<\/th>/);
  assert.doesNotMatch(interns.match(/<span className="person-cell">.*?<\/span>/)?.[0] ?? '', /<button/);
  assert.match(interns, /className="table-actions"/);
  assert.match(source, /<td><b>\{record.studentName\}<\/b><\/td>/);
  assert.doesNotMatch(source, /\{record.studentName\} · View history/);
});

test('notifications contain one purposeful eye icon and separated title/time', () => {
  const shell = section('function AppShell(', 'function EmptyAction(');
  assert.equal((shell.match(/<Eye /g) ?? []).length, 1);
  assert.match(shell, /View all notifications/);
  assert.match(css, /\.notification-popover a > span \{ display: grid; gap: 5px/);
});

test('compact fields remain an explicit variant, with semantic option surfaces', () => {
  assert.match(source, /field field-compact/);
  assert.match(css, /--control-height: 48px/);
  assert.match(css, /--control-height-compact: 44px/);
  for (const selector of ['criterion-builder-row', 'master-current-option']) {
    const rule = css.match(new RegExp('\\.' + selector + ' \\{[^}]*\\}'))?.[0];
    assert.match(rule ?? '', /background: var\(--surface-muted\)/);
  }
  assert.match(source, /template.description \|\| "No description provided\."/);
});

test('existing errors are actionable without exposing database details', () => {
  assert.match(userError({ message: 'duplicate key value violates unique constraint', code: '23505' }), /already exists/);
  assert.match(userError(new Error('foreign key constraint 23503')), /linked to other records/);
  assert.match(userError(new Error('permission denied for table profiles')), /does not have permission/);
  assert.equal(userError(new Error('syntax error in SQLSTATE 42601'), 'Please retry.'), 'Please retry.');
});

function luminance(hex) {
  const rgb = hex.match(/[a-f0-9]{2}/gi).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
test('green accent is separate from success and all primary color pairs meet text contrast', () => {
  const green = css.match(/html\[data-accent="green"\] \{ --primary: (#[a-f0-9]+)/)[1];
  const success = css.match(/html \{ --success: (#[a-f0-9]+)/)[1];
  assert.notEqual(green, success);
  for (const [background, foreground] of [['#2563eb', '#ffffff'], ['#db2777', '#ffffff'], ['#d99a00', '#241900'], [green, '#ffffff'], ['#e6f5ee', '#166044'], ['#183b2c', '#a2e8bb']]) {
    const values = [luminance(background), luminance(foreground)].sort((a,b) => b-a);
    assert.ok((values[0]+.05)/(values[1]+.05) >= 4.5, `${foreground} on ${background}`);
  }
});

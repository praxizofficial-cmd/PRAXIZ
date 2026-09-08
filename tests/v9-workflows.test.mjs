import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../app/PraxizApp.tsx');
const auth = read('../app/auth/supabase-auth.tsx');
const css = read('../app/globals.css');
const pdfViewer = read('../app/components/EvaluationPdfDownload.tsx');
const evaluation = read('../app/components/EvaluationWorkspace.tsx');
const services = read('../app/services/praxiz-services.ts');
const feedbackMigration = read('../database/20260908_feedback_read_status.sql');
const provisioningMigration = read('../database/20260908_privileged_account_provisioning.sql');
const completionMigration = read('../database/20260908_complete_privileged_provisioning.sql');
const completionFixMigration = read('../database/20260908_fix_complete_privileged_provisioning.sql');
const provisioningRoute = read('../app/api/accounts/provision/route.ts');
const contactRoute = read('../app/api/contact/route.ts');
const layout = read('../app/layout.tsx');

test('v9 branding and landing journey use the approved identity and exact slogan', () => {
  assert.match(app, /src="\/branding\/praxiz-symbol\.png"/);
  assert.match(app, /Progress, <em>Powered by Technology\.<\/em>/);
  for (const stage of ['Placement', 'Attendance', 'Daily Logs', 'Documents', 'Evaluation', 'Analytics & Insights']) {
    assert.match(app, new RegExp(`'${stage.replace('&', '\\&')}'`));
  }
  assert.match(layout, /icon: "\/branding\/praxiz-symbol\.png"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('public registration is restricted to Student Intern accounts', () => {
  assert.match(app, /Create Student Intern account/);
  assert.match(app, />Create account<\/Link>/);
  assert.match(app, /await register\(\{\s*role: 'student'/);
  assert.match(auth, /if \(input\.role !== 'student'\)/);
  assert.match(auth, /requested_role: registrationRole\.student/);
  assert.doesNotMatch(app.slice(app.indexOf('function RegisterPage()'), app.indexOf('function RegistrationSuccessPage()')), /roleOptions|name="role"/);
});

test('authorized account provisioning is server-side and role-gated', () => {
  assert.match(app, /Create Internship Coordinator/);
  assert.match(app, /Create HTE Representative/);
  assert.match(provisioningRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(provisioningRoute, /codes\.has\('system_admin'\)/);
  assert.match(provisioningRoute, /codes\.has\('internship_coordinator'\)/);
  assert.match(provisioningMigration, /account_provisioning_authorizations/);
  assert.match(provisioningMigration, /revoke all on table public\.account_provisioning_authorizations/);
  assert.match(provisioningRoute, /complete_authorized_account_provisioning/);
  assert.match(completionMigration, /current_setting\('request\.jwt\.claim\.role'/);
  assert.match(completionMigration, /grant execute on function public\.complete_authorized_account_provisioning\(uuid, uuid\) to service_role/);
  assert.match(completionMigration, /role\.code = 'system_admin'/);
  assert.match(completionMigration, /role\.code = 'internship_coordinator'/);
  assert.doesNotMatch(completionMigration, /public\.faculty_profiles/);
  assert.match(completionFixMigration, /obsolete faculty profile write/);
});

test('evaluation reports separate details, report, and protected PDF actions', () => {
  assert.match(evaluation, />View details<\/button>/);
  assert.match(evaluation, /r\.status === 'Finalized'.*EvaluationPdfDownload/);
  assert.doesNotMatch(evaluation, />View report<\/button>/);
  for (const action of ['View PDF', 'Open in new tab']) assert.match(pdfViewer, new RegExp(action));
  assert.doesNotMatch(pdfViewer, /<Printer|<Download|Print evaluation PDF\?|Download evaluation PDF\?/);
  assert.match(pdfViewer, /<iframe/);
  assert.match(pdfViewer, /target="_blank" rel="noopener noreferrer"/);
  assert.match(pdfViewer, /title="Official PSU-F-PLU-02 evaluation PDF"/);
});

test('v11 public interactions are connected, keyboard-ready, and use one contextual description', () => {
  assert.match(app, /className="journey-node-button"/);
  assert.match(app, /aria-pressed=\{activeJourneyIndex === index\}/);
  assert.match(app, /id="active-journey-description" aria-live="polite"/);
  assert.match(app, /className=\{`analytics-flow-lines analytics-line-\$\{activeAnalyticsInput\}`\}/);
  assert.match(app, /aria-pressed=\{activeAnalyticsInput === index\}/);
  assert.match(css, /@keyframes hero-path-draw/);
  assert.match(css, /@keyframes analytics-path-draw/);
});

test('v11 authentication, feedback, notifications, and loading states use shared accessible patterns', () => {
  const signin = app.slice(app.indexOf('function SignInPage'), app.indexOf('function ForgotPasswordPage'));
  const registration = app.slice(app.indexOf('function RegisterPage'), app.indexOf('function RegistrationSuccessPage'));
  assert.match(signin, /Back to PRAXIZ/);
  assert.match(signin, /auth-title-row/);
  assert.match(registration, /Back to PRAXIZ/);
  assert.match(app, /function FeedbackDetailDialog/);
  assert.match(app, />Close<\/ActionButton>/);
  assert.match(app, /notification-empty/);
  assert.match(app, /notification-all-link/);
  assert.match(auth, /Preparing your workspace/);
  assert.match(auth, /Loading your authorized internship tools and verified PRAXIZ data\./);
});

test('attendance and feedback workflows expose the requested filters and independent states', () => {
  assert.match(app, /<span>Month<\/span>/);
  assert.match(app, /<span>Year<\/span>/);
  assert.match(app, /Export filtered CSV/);
  assert.match(app, /<th className="feedback-status-cell">Status<\/th>/);
  assert.doesNotMatch(app, /<th>Follow-up status<\/th>/);
  assert.match(services, /recipient_read_at/);
  assert.match(services, /readStatus: row\.recipient_read_at \? "Read" : "Unread"/);
  assert.match(feedbackMigration, /mark_internship_feedback_read/);
});

test('v10 contact delivery remains server-side and registration year choices are scoped', () => {
  assert.match(app, /Send message/);
  assert.doesNotMatch(app, /Open email draft/);
  assert.match(contactRoute, /RESEND_API_KEY/);
  assert.match(contactRoute, /praxiz\.official@gmail\.com/);
  const registration = app.slice(app.indexOf('function RegistrationFields'), app.indexOf('function RegistrationSuccessPage'));
  assert.match(registration, /Third Year/);
  assert.match(registration, /Fourth Year/);
  assert.doesNotMatch(registration, /First Year|Second Year|Fifth Year/);
});

test('settings retain four compact cards and semantic controls', () => {
  for (const card of ['account-settings-card', 'security-settings-card', 'notification-settings-card', 'appearance-settings-card']) {
    assert.match(app, new RegExp(card));
  }
  assert.match(app, /role="switch"/);
  assert.match(css, /\.settings-card-grid[^}]*grid-template-columns: repeat\(2/);
});

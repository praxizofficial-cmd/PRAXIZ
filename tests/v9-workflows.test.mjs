import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../app/PraxizApp.tsx");
const publicFlow = read("../app/components/PublicInteractiveFlow.tsx");
const auth = read("../app/auth/supabase-auth.tsx");
const css = read("../app/globals.css");
const pdfViewer = read("../app/components/EvaluationPdfDownload.tsx");
const evaluation = read("../app/components/EvaluationWorkspace.tsx");
const services = read("../app/services/praxiz-services.ts");
const feedbackMigration = read("../database/20260908_feedback_read_status.sql");
const provisioningMigration = read(
  "../database/20260908_privileged_account_provisioning.sql",
);
const completionMigration = read(
  "../database/20260908_complete_privileged_provisioning.sql",
);
const completionFixMigration = read(
  "../database/20260908_fix_complete_privileged_provisioning.sql",
);
const completionGuardFixMigration = read(
  "../database/20260914_fix_service_role_completion_guard.sql",
);
const provisioningRoute = read("../app/api/accounts/provision/route.ts");
const contactRoute = read("../app/api/contact/route.ts");
const contactMigration = read("../database/20260912_contact_support_inbox.sql");
const layout = read("../app/layout.tsx");
const academicOptions = read("../app/academic-options.ts");
const compactApp = app.replace(/\s+/g, " ");
const compactEvaluation = evaluation.replace(/\s+/g, " ");
const compactProvisioningRoute = provisioningRoute.replace(/\s+/g, " ");
const compactCss = css.replace(/\s+/g, " ");

test("v9 branding and landing journey use the approved identity and exact slogan", () => {
  assert.match(app, /src="\/branding\/praxiz-symbol\.png"/);
  assert.match(app, /The Pursuit of Knowledge\./);
  assert.match(app, /The Practice of Intelligence\./);
  for (const stage of [
    "Placement",
    "Monitor",
    "Evaluate",
    "Understand",
  ]) {
    assert.match(app, new RegExp(`["']${stage.replace("&", "\\&")}["']`));
  }
  assert.match(layout, /icon: "\/branding\/praxiz-symbol\.png"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("public registration is restricted to Student Intern accounts", () => {
  assert.match(app, /Create Student Intern account/);
  assert.match(app, />Create account<\/Link>/);
  assert.match(compactApp, /await register\(\{ role: "student"/);
  assert.match(auth, /if \(input\.role !== "student"\)/);
  assert.match(auth, /requested_role: registrationRole\.student/);
  assert.doesNotMatch(
    app.slice(
      app.indexOf("function RegisterPage()"),
      app.indexOf("function RegistrationSuccessPage()"),
    ),
    /roleOptions|name="role"/,
  );
});

test("authorized account provisioning is server-side and role-gated", () => {
  assert.match(app, /Create Internship Coordinator/);
  assert.match(app, /Review registrations/);
  assert.match(app, /Create HTE Representative/);
  assert.match(provisioningRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(provisioningRoute, /codes\.has\("system_admin"\)/);
  assert.match(provisioningRoute, /codes\.has\("internship_coordinator"\)/);
  assert.match(
    compactApp,
    /<span>Campus \*<\/span> <select required value=\{campusId\}/,
  );
  assert.match(
    compactApp,
    /<span>College \/ academic unit \*<\/span> <select required value=\{collegeId\}/,
  );
  assert.match(
    compactApp,
    /setCampusId\(event\.target\.value\); setCollegeId\(""\); setProgramIds\(\[\]\)/,
  );
  assert.match(
    compactApp,
    /programsForCollege\( institutionalOptions\.units, institutionalOptions\.programs, collegeId, \)/,
  );
  assert.match(
    provisioningRoute,
    /Select a campus, college, and at least one authorized academic program/,
  );
  assert.match(provisioningRoute, /college\.parent_id !== requestedCampusId/);
  assert.match(
    provisioningRoute,
    /Every selected program must belong to the selected college/,
  );
  assert.match(
    provisioningRoute,
    /campus_org_unit_id: role === "coordinator" \? requestedCampusId : null/,
  );
  assert.match(provisioningRoute, /scope: "institution_wide"/);
  assert.match(
    provisioningRoute,
    /scope_label: "All active Partido State University campuses"/,
  );
  assert.match(provisioningRoute, /organizationUnitId = requestedCollegeId/);
  assert.match(
    compactCss,
    /\.user-account-actions \{ width: min\(100%, 672px\); display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.doesNotMatch(provisioningRoute, /requested_role\s*:/);
  assert.match(provisioningRoute, /requested_role_id: roleRecord\.id/);
  assert.match(
    provisioningRoute,
    /pendingAuthorization\.authorized_by_user_id !== auth\.user\.id/,
  );
  assert.match(
    compactProvisioningRoute,
    /\.delete\(\) \.eq\("id", authorization\.id\)/,
  );
  assert.match(provisioningMigration, /account_provisioning_authorizations/);
  assert.match(
    provisioningMigration,
    /revoke all on table public\.account_provisioning_authorizations/,
  );
  assert.match(provisioningRoute, /complete_authorized_account_provisioning/);
  assert.doesNotMatch(
    completionMigration,
    /current_setting\('request\.jwt\.claim\.role'/,
  );
  assert.match(
    completionMigration,
    /grant execute on function public\.complete_authorized_account_provisioning\(uuid, uuid\) to service_role/,
  );
  assert.match(completionGuardFixMigration, /remove the obsolete runtime/);
  assert.match(
    completionGuardFixMigration,
    /revoke all on function public\.complete_authorized_account_provisioning\(uuid, uuid\) from public, anon, authenticated/,
  );
  assert.match(
    completionGuardFixMigration,
    /grant execute on function public\.complete_authorized_account_provisioning\(uuid, uuid\) to service_role/,
  );
  assert.match(completionMigration, /role\.code = 'system_admin'/);
  assert.match(completionMigration, /role\.code = 'internship_coordinator'/);
  assert.doesNotMatch(completionMigration, /public\.faculty_profiles/);
  assert.match(completionFixMigration, /obsolete faculty profile write/);
});

test("evaluation reports separate reviewer details from student finalized PDF access", () => {
  assert.match(
    compactEvaluation,
    /\{!student && \( <button className="table-link"/,
  );
  assert.match(evaluation, /Review HTE evaluation/);
  assert.match(
    compactEvaluation,
    /r\.status === "Finalized" && \( <EvaluationPdfDownload/,
  );
  assert.doesNotMatch(evaluation, />View report<\/button>/);
  for (const action of ["Official PDF", "View PDF", "Download", "Open in new tab"])
    assert.match(pdfViewer, new RegExp(action));
  assert.match(pdfViewer, /<iframe/);
  assert.match(pdfViewer, /target="_blank" rel="noopener noreferrer"/);
  assert.match(pdfViewer, /title="Finalized official evaluation PDF"/);
});

test("v11 public interactions are connected, keyboard-ready, and use one contextual description", () => {
  assert.match(app, /PublicInteractiveFlow label="Internship journey"/);
  const preview = read("../app/components/usePublicPreview.ts");
  const analytics = read("../app/components/PublicAnalytics.tsx");
  assert.match(publicFlow, /preview.controls\(index\)/);
  assert.match(publicFlow, /aria-live="polite"/);
  assert.match(preview, /"aria-pressed": selected === index/);
  assert.match(preview, /hovered \?\? focused \?\? selected/);
  assert.match(analytics, /className="record-connectors"/);
  assert.match(analytics, /source.controls\(index\)/);
  assert.match(analytics, /Not live PRAXIZ analytics/);
});

test("v11 authentication, feedback, notifications, and loading states use shared accessible patterns", () => {
  const signin = app.slice(
    app.indexOf("function SignInPage"),
    app.indexOf("function ForgotPasswordPage"),
  );
  const registration = app.slice(
    app.indexOf("function RegisterPage"),
    app.indexOf("function RegistrationSuccessPage"),
  );
  assert.match(signin, /Back to PRAXIZ/);
  assert.match(signin, /auth-title-row/);
  assert.match(registration, /Back to PRAXIZ/);
  assert.match(app, /function FeedbackDetailDialog/);
  assert.match(app, />Close<\/ActionButton>/);
  assert.match(app, /notification-empty/);
  assert.match(app, /notification-all-link/);
  assert.match(auth, /Preparing workspace/);
  assert.doesNotMatch(auth, /Loading your authorized internship tools/);
});

test("attendance and feedback workflows expose the requested filters and independent states", () => {
  assert.match(app, /<span>Month<\/span>/);
  assert.match(app, /<span>Year<\/span>/);
  assert.match(app, /Export filtered CSV/);
  assert.match(app, /StatusBadge status=\{item\.status\}/);
  assert.match(app, /StatusBadge status=\{item\.readStatus\}/);
  assert.match(services, /recipient_read_at/);
  assert.match(
    services,
    /readStatus: row\.recipient_read_at \? "Read" : "Unread"/,
  );
  assert.match(feedbackMigration, /mark_internship_feedback_read/);
});

test("v10 contact delivery remains server-side and registration year choices are scoped", () => {
  assert.match(app, /Send message/);
  assert.doesNotMatch(app, /Open email draft/);
  assert.match(contactRoute, /contact_messages/);
  assert.match(contactRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(contactRoute, /RESEND_API_KEY/);
  assert.match(contactRoute, /praxiz\.official@gmail\.com/);
  assert.match(app, /Support inbox/);
  assert.match(services, /listContactMessages/);
  assert.match(contactMigration, /enable row level security/);
  assert.match(
    contactMigration,
    /private\.is_system_administrator\(auth\.uid\(\)\)/,
  );
  assert.match(
    contactMigration,
    /revoke all on public\.contact_messages from public, anon, authenticated/,
  );
  const registration = app.slice(
    app.indexOf("function RegistrationFields"),
    app.indexOf("function RegistrationSuccessPage"),
  );
  assert.match(registration, /STUDENT_YEAR_LEVEL_OPTIONS/);
  assert.match(academicOptions, /STUDENT_YEAR_LEVEL_OPTIONS = \[1, 2, 3, 4\]/);
  assert.doesNotMatch(
    academicOptions,
    /STUDENT_YEAR_LEVEL_OPTIONS = \[[^\]]*5/,
  );
});

test("settings retain four compact cards and semantic controls", () => {
  for (const card of [
    "account-settings-card",
    "security-settings-card",
    "notification-settings-card",
    "appearance-settings-card",
  ]) {
    assert.match(app, new RegExp(card));
  }
  assert.match(app, /role="switch"/);
  assert.match(
    css,
    /\.settings-card-grid[^}]*grid-template-columns: repeat\(2/,
  );
});

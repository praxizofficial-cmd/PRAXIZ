import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const app = await read("../app/PraxizApp.tsx");
const auth = await read("../app/auth/supabase-auth.tsx");
const provision = await read("../app/api/accounts/provision/route.ts");
const layout = await read("../app/layout.tsx");
const inviteTemplate = await read("../docs/supabase-invite-template-v26.html");
const recoveryTemplate = await read("../docs/supabase-recovery-template-v26.html");
const ai = await read("../app/components/PraxizAiAssistant.tsx");
const services = await read("../app/services/praxiz-services.ts");
const migration = await read("../supabase/migrations/20261014000000_v26_required_hours.sql");
const placementInviteMigration = await read("../supabase/migrations/20261015000000_v26_placement_head_invitation.sql");

test("v26 invitation landing is GET-safe and verification requires an explicit action", () => {
  const pageStart = app.indexOf("function AcceptInvitationPage");
  const resetStart = app.indexOf("function ResetPasswordPage", pageStart);
  const page = app.slice(pageStart, resetStart);
  assert.ok(pageStart >= 0 && resetStart > pageStart);
  assert.match(page, /Accept invitation/);
  assert.match(page, /async function accept\(\)/);
  assert.match(page, /await acceptInvitation\(tokenHash\)/);
  assert.doesNotMatch(page, /useEffect\([\s\S]*verifyOtp/);
  assert.match(auth, /type: "invite"/);
  assert.match(provision, /\/accept-invitation/);
  assert.match(layout, /name="referrer" content="no-referrer"/);
  assert.match(inviteTemplate, /TokenHash/);
  assert.doesNotMatch(inviteTemplate, /href="\{\{ \.ConfirmationURL \}\}"/);
});

test("v26 recovery and invitation password sessions remain separate", () => {
  assert.match(auth, /PASSWORD_RECOVERY_SESSION_KEY/);
  assert.match(auth, /INVITATION_SESSION_KEY/);
  assert.match(auth, /flow === "invitation"/);
  assert.match(auth, /getRememberedInvitationSession/);
  assert.match(auth, /restorePasswordRecoverySession/);
  assert.match(auth, /await supabase\.auth\.signOut\(\)/);
});

test("v26 password recovery landing is GET-safe and verifies only after explicit acceptance", () => {
  const pageStart = app.indexOf("function AcceptPasswordRecoveryPage");
  const resetStart = app.indexOf("function ResetPasswordPage", pageStart);
  const page = app.slice(pageStart, resetStart);
  assert.ok(pageStart >= 0 && resetStart > pageStart);
  assert.match(page, /Continue to password reset/);
  assert.match(page, /async function accept\(\)/);
  assert.match(page, /await acceptPasswordRecovery\(tokenHash\)/);
  assert.doesNotMatch(page, /useEffect\([\s\S]*verifyOtp/);
  assert.match(auth, /async acceptPasswordRecovery\(tokenHash\)/);
  assert.match(auth, /type: "recovery"/);
  assert.match(auth, /authRedirectUrl\("\/recover-password"\)/);
  assert.match(recoveryTemplate, /TokenHash/);
  assert.match(recoveryTemplate, /\/recover-password\?token_hash=/);
  assert.doesNotMatch(recoveryTemplate, /ConfirmationURL/);
});

test("v26 password setup renders deterministically before reading the browser URL", () => {
  const pageStart = app.indexOf("function ResetPasswordPage");
  const pageEnd = app.indexOf("type ProgramChoice", pageStart);
  const page = app.slice(pageStart, pageEnd);
  assert.ok(pageStart >= 0 && pageEnd > pageStart);
  assert.match(page, /useState<"recovery" \| "invitation" \| null>\(null\)/);
  assert.match(page, /new URLSearchParams\(window\.location\.search\)/);
  assert.doesNotMatch(page, /useState<"recovery" \| "invitation">\(\(\) =>[\s\S]*window/);
  assert.match(page, /flow === null \? "Secure access"/);
});

test("v26 password setup keeps a successful update visible after recovery sign-out", () => {
  const pageStart = app.indexOf("function ResetPasswordPage");
  const pageEnd = app.indexOf("type ProgramChoice", pageStart);
  const page = app.slice(pageStart, pageEnd);
  assert.ok(pageStart >= 0 && pageEnd > pageStart);
  assert.match(page, /const passwordUpdated = useRef\(false\)/);
  assert.match(
    page,
    /await updatePassword\(password, flow\);[\s\S]*passwordUpdated\.current = true;[\s\S]*setComplete\(true\)/,
  );
  assert.match(page, /if \(!active \|\| passwordUpdated\.current\) return/);
  assert.ok(
    page.indexOf("{complete ? (") < page.indexOf('recoveryState === "checking" ? ('),
    "the completed state must take precedence over post-sign-out validation states",
  );
});

test("v26 registration review is complete and direct success navigation is honest", () => {
  assert.match(app, /title="Review your registration"/);
  assert.match(app, /<dt>Full name<\/dt>/);
  assert.match(app, /<dt>Campus<\/dt>/);
  assert.match(app, /<dt>College \/ academic unit<\/dt>/);
  assert.match(app, /if \(value === "3"\) return "3rd Year"/);
  assert.match(app, /if \(value === "4"\) return "4th Year"/);
  assert.doesNotMatch(app, /\$\{yearLevel\}th Year/);
  assert.match(app, /No recent submission found/);
  assert.match(app, /praxiz-registration-submission/);
  assert.doesNotMatch(app, /Open the Supabase verification message/);
});

test("v26 AI keeps the composer anchored without forcing a scrolled-up user to the bottom", () => {
  assert.match(ai, /stickToLatestRef/);
  assert.match(ai, /scrollHeight - conversation\.scrollTop - conversation\.clientHeight < 72/);
  assert.match(ai, /if \(!open \|\| !stickToLatestRef\.current\) return/);
});

test("v26 required-hour propagation is previewed, explicit, reasoned, and active-only", () => {
  assert.match(services, /preview_internship_requirement_scope_v26/);
  assert.match(services, /save_internship_requirement_scope_v26/);
  assert.match(app, /Active snapshots affected/);
  assert.match(app, /Reason for updating active assignments/);
  assert.match(app, /Required hours are not configured/);
  assert.match(migration, /assignment\.status = 'active'/);
  assert.match(migration, /assignment\.required_hours is distinct from p_required_hours/);
  assert.match(migration, /previous_required_hours/);
  assert.match(migration, /new_required_hours/);
  assert.match(migration, /changed_by_user_id/);
  assert.match(migration, /v_reason/);
  assert.doesNotMatch(migration, /update public\.internship_assignments[\s\S]*status in \('completed'/i);
  assert.doesNotMatch(migration, /delete from|truncate|drop table/i);
});

test("v26 Placement Head provisioning stays invitation-only and reaches completion", () => {
  assert.match(provision, /role === "placement"/);
  assert.match(provision, /"complete_placement_head_provisioning"/);
  assert.match(
    placementInviteMigration,
    /'internship_coordinator',[\s\S]*'hte_supervisor',[\s\S]*'placement_head'/,
  );
  assert.match(
    placementInviteMigration,
    /account_provisioning_authorizations[\s\S]*consumed_at is null[\s\S]*expires_at/,
  );
  assert.match(
    placementInviteMigration,
    /Privileged accounts require an authorized PRAXIZ invitation/,
  );
  assert.doesNotMatch(
    placementInviteMigration,
    /if requested_code = 'placement_head' then\s+return new/i,
  );
  assert.match(
    placementInviteMigration,
    /role\.code = 'internship_coordinator'[\s\S]*Save program request changes before approving/,
  );
  assert.doesNotMatch(
    placementInviteMigration,
    /begin\s+if tg_op = 'UPDATE' and new\.status = 'approved'/i,
  );
  assert.match(
    placementInviteMigration,
    /complete_placement_head_provisioning[\s\S]*private\.emit_notification\(/,
  );
  assert.match(
    placementInviteMigration,
    /registration-approved:placement-head:/,
  );
});

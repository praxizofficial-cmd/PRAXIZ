import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeInstitutionalEmail,
  validateInstitutionalEmail,
} from "../app/services/institutional-email.ts";

const app = readFileSync(new URL("../app/PraxizApp.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../app/auth/supabase-auth.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../app/services/praxiz-services.ts", import.meta.url), "utf8");
const placement = readFileSync(new URL("../app/components/PlacementWorkspace.tsx", import.meta.url), "utf8");
const ai = readFileSync(new URL("../app/components/PraxizAiAssistant.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20261011000000_v22_authoritative_repairs.sql", import.meta.url),
  "utf8",
);

test("V22 institutional email validation accepts only the exact PSU mailbox shape", () => {
  assert.equal(normalizeInstitutionalEmail("  ABc123.PBOX@PARSU.EDU.PH "), "abc123.pbox@parsu.edu.ph");
  assert.equal(validateInstitutionalEmail("student233.pbox@parsu.edu.ph", "202311233").valid, true);
  assert.equal(validateInstitutionalEmail("STUDENT233.PBOX@PARSU.EDU.PH", "2023-11-233").valid, true);
  assert.equal(validateInstitutionalEmail("student@gmail.com", "202311233").valid, false);
  assert.equal(validateInstitutionalEmail("student233.pbox@parsu.edu.ph.fake.test", "202311233").valid, false);
  assert.equal(validateInstitutionalEmail("student23.pbox@parsu.edu.ph", "202311233").valid, false);
  assert.equal(validateInstitutionalEmail("student233@parsu.edu.ph", "202311233").valid, false);
  assert.equal(validateInstitutionalEmail("student999.pbox@parsu.edu.ph", "202311233").valid, false);
});

test("V22 repeats student registration validation on the server and limits active choices", () => {
  assert.match(auth, /validateInstitutionalEmail/);
  assert.match(migration, /validate_student_registration_v22/);
  assert.match(migration, /right\(v_student_number, 3\) <> v_email_suffix/);
  assert.match(migration, /v_year_level not in \('3', '4'\)/);
  assert.match(migration, /term\.is_current or term\.configuration_status = 'configured'/);
  assert.match(app, /STUDENT_YEAR_LEVEL_OPTIONS/);
  assert.match(app, /registration-section-heading/);
  assert.match(app, /title="Review your registration"/);
});

test("V22 HTE intern and work-configuration reads are scoped server-side", () => {
  assert.match(service, /list_my_hte_interns_v22/);
  assert.match(service, /list_hte_daily_hour_configs_v22/);
  assert.match(migration, /join authorized_hte scope on scope\.hte_id = assignment\.hte_id/);
  assert.match(migration, /representative\.user_id = auth\.uid\(\)/);
  assert.match(migration, /assignment\.status in \('active', 'completed'\)/);
  assert.match(app, /internError \? "Unavailable"/);
});

test("V22 requirement propagation updates only matching active snapshots and records an audit row", () => {
  assert.match(migration, /internship_requirement_assignment_updates/);
  assert.match(migration, /p_apply_to_current_assignments boolean default false/);
  assert.match(migration, /assignment\.status = 'active'/);
  assert.doesNotMatch(migration, /assignment\.status = 'completed'[\s\S]{0,180}set required_hours/);
  assert.match(app, /Apply this requirement to matching current active assignments/);
  assert.match(app, /Completed, cancelled, and historical/);
  assert.doesNotMatch(app, /placeholder="e\.g\. 400"/);
});

test("V22 document and required-format actions expose complete secure review paths", () => {
  assert.match(service, /popup\.location\.replace\(signedUrl\)/);
  assert.match(placement, /Preview/);
  assert.match(placement, /Download/);
  assert.match(placement, /History/);
  assert.match(placement, /Return with feedback/);
  assert.match(migration, /return_required_file_format_version_v22/);
  assert.match(migration, /status = 'returned'/);
});

test("V22 landing, AI thinking, sidebar, and modal polish are responsive", () => {
  assert.match(app, /className="analytics-final-line"/);
  assert.match(app, /Placement Head/);
  assert.match(ai, /ai-thinking/);
  assert.match(ai, /ai-thinking-wave/);
  assert.match(styles, /\.document-preview-dialog[\s\S]*88dvh/);
  assert.match(styles, /\.sidebar-pin[\s\S]*right: -15px/);
  assert.match(styles, /@media \(max-width: 390px\)/);
});

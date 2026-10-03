import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("database/20261002_weekly_logs_student_academics_hte_evaluation.sql");
const app = read("app/PraxizApp.tsx");
const data = read("app/data.ts");
const services = read("app/services/praxiz-services.ts");
const academicOptions = read("app/academic-options.ts");
const evaluationWorkspace = read("app/components/EvaluationWorkspace.tsx");
const permissions = read("app/permissions.ts");

test("Student Intern registration uses controlled section and normalized academic terms", () => {
  assert.match(app, /name="section"[\s\S]*STUDENT_SECTION_OPTIONS/);
  assert.match(academicOptions, /STUDENT_SECTION_OPTIONS = \["A", "B", "C", "D", "E"\]/);
  assert.match(app, /name="academicTermId"/);
  assert.match(migration, /foreign key \(academic_term_id\)[\s\S]*references public\.academic_terms\(id\)/);
  assert.match(migration, /section in \('A', 'B', 'C', 'D', 'E'\)/);
  assert.match(migration, /Student Intern section must be A, B, C, D, or E/);
  assert.match(migration, /create or replace function public\.get_registration_academic_terms\(\)/);
  assert.match(migration, /sync_student_academics_after_approval/);
  assert.match(services, /rpc\("get_registration_academic_terms"\)/);
});

test("coordinator year and section filters retain backend program scope", () => {
  assert.match(app, /Filter by year level/);
  assert.match(app, /Filter by section/);
  assert.match(services, /rpc\("list_coordinator_program_students_v2"\)/);
  assert.match(migration, /list_coordinator_program_students_v2/);
  assert.match(migration, /private\.has_program_permission\([\s\S]*'internships:manage'/);
  assert.match(migration, /student_profiles_program_year_section_idx/);
});

test("Weekly Logs preserve physical history while enforcing assignment-week uniqueness", () => {
  assert.match(migration, /alter table public\.daily_logs add column if not exists week_start_date/);
  assert.match(migration, /reporting_period_kind = 'daily_legacy'/);
  assert.match(migration, /daily_logs_assignment_week_unique/);
  assert.match(migration, /where deleted_at is null and reporting_period_kind = 'weekly'/);
  assert.match(migration, /assignment\.student_user_id = auth\.uid\(\)/);
  assert.match(migration, /public\.save_daily_log\(/);
  assert.match(migration, /public\.review_daily_log\(/);
  assert.match(migration, /Weekly Log resubmitted/);
  assert.match(data, /\/student\/weekly-logs/);
  assert.match(data, /\/coordinator\/weekly-logs/);
  assert.match(data, /\/hte\/weekly-logs/);
});

test("only assigned HTE representatives score and only scoped coordinators finalize", () => {
  assert.match(migration, /template\.evaluator_type = 'hte'/);
  assert.match(migration, /supervisor\.supervisor_type = 'hte'/);
  assert.match(migration, /role\.code = 'internship_coordinator'/);
  assert.match(migration, /update public\.evaluation_templates[\s\S]*evaluator_type = 'coordinator'/);
  assert.match(migration, /Coordinator evaluation forms are retired/);
  assert.doesNotMatch(migration, /foreach evaluator in array array\['hte','coordinator'\]/);
  assert.match(evaluationWorkspace, /Complete HTE evaluation/);
  assert.match(evaluationWorkspace, /Review HTE evaluation/);
  assert.match(evaluationWorkspace, /Finalize HTE evaluation/);
  assert.doesNotMatch(permissions.match(/admin: new Set\(\[[\s\S]*?\]\)/)?.[0] ?? "", /evaluations:score|evaluations:finalize/);
});

test("student evaluation access is finalized-report-only and notifications follow the authority chain", () => {
  assert.match(services, /eq\("evaluation_templates\.evaluator_type", "hte"\)/);
  assert.match(evaluationWorkspace, /Finalized evaluation reports/);
  assert.match(evaluationWorkspace, /View and download evaluation reports released after coordinator finalization/);
  assert.match(migration, /HTE evaluation ready for coordinator review/);
  assert.match(migration, /HTE evaluation returned for revision/);
  assert.match(migration, /Finalized evaluation report available/);
  assert.match(migration, /\/student\/evaluations/);
});

test("active UI terminology uses Weekly Logs and does not expose a coordinator score form", () => {
  const activeUi = [app, data, read("app/components/PraxizAiAssistant.tsx"), read("app/components/PolicyPage.tsx")].join("\n");
  assert.doesNotMatch(activeUi, /Daily Logs?/);
  assert.doesNotMatch(evaluationWorkspace, /Coordinator Evaluation|Complete coordinator evaluation/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACADEMIC_TERM_LABELS,
  STUDENT_SECTION_OPTIONS,
  STUDENT_YEAR_LEVEL_OPTIONS,
  academicTermLabel,
  mergeAcademicOptionValues,
} from "../app/academic-options.ts";
import { inboxLinkForEmail } from "../app/services/registration-success.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("standard academic options are centralized and complete", () => {
  assert.deepEqual(STUDENT_YEAR_LEVEL_OPTIONS, [1, 2, 3, 4]);
  assert.deepEqual(STUDENT_SECTION_OPTIONS, ["A", "B", "C", "D", "E"]);
  assert.deepEqual(ACADEMIC_TERM_LABELS, {
    first_semester: "1st Semester",
    second_semester: "2nd Semester",
    midyear: "Midyear",
  });
  assert.equal(academicTermLabel("second_semester"), "2nd Semester");
  assert.deepEqual(mergeAcademicOptionValues([1, 2, 3, 4], [4, 5]), [1, 2, 3, 4, 5]);
});

test("known email providers receive safe inbox links and custom domains do not", () => {
  assert.equal(inboxLinkForEmail("student@gmail.com")?.label, "Open Gmail inbox");
  assert.equal(inboxLinkForEmail("student@outlook.com")?.label, "Open Outlook inbox");
  assert.equal(inboxLinkForEmail("student@yahoo.com")?.label, "Open Yahoo Mail");
  assert.equal(inboxLinkForEmail("student@parsu.edu.ph"), null);
});

test("the database migration adds missing terms without replacing current data", () => {
  const migration = read("database/20261003_registration_options_and_terms.sql");
  assert.match(migration, /insert into public\.academic_terms/);
  assert.match(migration, /'second_semester'/);
  assert.match(migration, /'midyear'/);
  assert.match(migration, /not exists/);
  assert.doesNotMatch(migration, /delete from|truncate|drop table/i);
});

test("forgot password shares the compact sign-in shell and motion remains accessible", () => {
  const app = read("app/PraxizApp.tsx");
  const css = read("app/globals.css");
  assert.match(app, /function CompactAuthPage/);
  assert.match(app, /Open your email inbox/);
  assert.match(app, /inboxLinkForEmail/);
  assert.match(css, /@keyframes workspace-content-enter/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

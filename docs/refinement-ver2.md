# PRAXIZ refinement release report

Updated September 5, 2026. Production database migration, official-form publication, dependency hardening and Vercel deployment are complete. Public URL: https://praxiz.vercel.app. Current production deployment: dpl_DzhAZU6Pied1FQAAfipgMmS2gDEA.

## 1. Implementation summary

Refined the existing PRAXIZ application rather than rebuilding it. Preserved Vercel, Supabase, email/password authentication, backend roles, assignment scope and historical records. Added the official evaluation workflow/PDF, attendance confirmations/history, clearer reports and administrative filters, shared accessible dialogs, semantic themes and supplied branding.

Implementation map: evaluations use existing templates/criteria/versions/scores/reviews; attendance uses existing sessions/events/reviews; identity uses profiles/student profiles and trusted registration records; hierarchy uses organizational units/programs and separate terms; notifications/preferences use their existing recipient-scoped tables. No parallel database architecture or new application tables were introduced.

## 2. Official PSU evaluation

PSU-F-PLU-02, Rev. No. 00, effective January 2, 2026 is database-driven. Each published HTE/coordinator final template has all 18 criteria: five Communication Skills, three Technical Skills and ten Critical Factors, including complete descriptions from the supplied form.

Scale: 5 OUTSTANDING, 4 VERY SATISFACTORY, 3 SATISFACTORY, 2 UNSATISFACTORY, 1 POOR. Official answers begin unrated and require whole numbers from 1 to 5. No arbitrary weighted percentage is calculated. Legacy configured scoring, including zero and decimal ratings, remains supported.

Publication superseded the previous active final HTE template without modifying its historical criteria or evaluations. Other evaluator roles/stages are not indiscriminately deactivated.

## 3. Evaluation workflow

Backend-authorized evaluators can create partial drafts and submit completed answers. Saves append immutable versions. Submitted versions are locked; authorized coordinators can return them with feedback or finalize them. Revisions preserve prior versions.

Only the original authorized evaluator can soft-delete a draft. Submitted/returned/finalized records cannot use draft deletion. Finalization freezes report metadata, names, criteria, scores and remarks. Students get only their own finalized report and PDF, never editable controls or earlier drafts. HTE evaluators do not gain coordinator finalization authority.

## 4. PDF implementation

The authenticated server route at app/api/evaluations/[id]/pdf/route.ts calls get_finalized_evaluation_report with the caller's Supabase session. No service-role key or public storage URL is used. Responses use private/no-store headers.

pdf-lib and embedded DejaVu Sans generate static A4 pages with the original PSU seal, official wording/scale, selected ratings, remarks, rater/designation, office, revision/effectivity and page numbers. The standard sample is two pages; long remarks paginate. Missing optional fields remain blank; no signatures are invented.

The authoritative database snapshot is immutable. Downloaded PDF bytes are not cryptographically signed and external software can still modify a copy. Historical reports are labeled as legacy rather than retroactively claiming official-form compliance; historical names are read from current profiles because old snapshots did not exist.

## 5. UX improvements

- Student: Time In/Out confirmation and processing feedback, clearer document/daily-log layouts, finalized reports/PDF and organized settings.
- Coordinator: scoped attendance history, distinct report datasets with separated filters/results, simpler HTE table/details and official evaluation/review workflow.
- HTE: assigned-intern evaluation and permitted draft deletion, readable rating sections, shared settings/dialog improvements.
- Administrator: institutional drill-down, separate academic terms, name/email columns, real account/registration/HTE status counts, search, generated template codes and official publication confirmation.
- Public: original branding, About/how-it-works/SDG/contact sections and only the three public stakeholder roles. Administrator remains an internal role.

## 6. Branding / assets

Original supplied files are stored under public/branding (praxiz-logo.png, parsu-logo.png) and public/sdgs (sdg-4.png, sdg-9.png, sdg-17.png). PRAXIZ branding appears in public navigation/footer, application navigation, authentication and loading views; SDGs appear in the landing-page sections. The official PDF uses the supplied PSU seal.

Colors and aspect ratios are preserved. CSS adjusts size/whitespace without tinting, hue rotation or stretching. Embedded PDF font and license are included under lib/report-assets.

## 7. Theme system

System/Light/Dark and Blue/Pink/Gold use shared semantic colors and existing device persistence. Official image colors remain unchanged. Light/Pink, Dark/Gold and System/Blue were exercised in the browser and preferences restored afterward. A tablet-width settings overflow was fixed using container-aware section layout.

## 8. Database changes

Applied once, transactionally, to the verified PRAXIZ production project:
database/20260904_official_evaluation.sql.

Added columns:

| Table | Columns |
| --- | --- |
| evaluation_templates | form_metadata jsonb |
| evaluation_criteria | section_label text; group_label text |
| evaluation_versions | form_context jsonb NOT NULL DEFAULT {} |
| evaluations | scoring_method text NOT NULL DEFAULT weighted; finalized_report jsonb |
| evaluation_reviews | scoring_method text NOT NULL DEFAULT weighted |

Replaced evaluations_check4 with evaluations_finalization_check and evaluation_reviews_check1 with evaluation_reviews_scoring_check to permit individual official ratings without an aggregate.

Functions added/replaced:

- private.guard_official_evaluation_metadata()
- private.allocate_template_code()
- private.can_view_evaluation_version(uuid)
- public.publish_official_evaluation_templates()
- public.save_evaluation_form(uuid,uuid,jsonb,jsonb,text,text,text,boolean,uuid)
- public.delete_evaluation_draft(uuid)
- public.review_evaluation(uuid,text,text)
- public.get_finalized_evaluation_report(uuid)
- public.create_evaluation_template(text,text,text,text,text,boolean,jsonb)

Triggers enforce published metadata immutability and allocate server codes on evaluation/document template insertion.

New restrictive authenticated SELECT policies: released_version_only on evaluation_versions; released_scores_only on evaluation_scores; released_reviews_only on evaluation_reviews. Existing audit and finalized-row immutability triggers remain.

PUBLIC execution is revoked for new public RPCs; authenticated calls still undergo internal authorization. Anonymous PDF RPC execution was verified false.

Service/report DTO types were updated. Full generated database.types.ts is not present in the existing repository; generation was attempted but Supabase CLI authentication is unavailable. This maintenance step remains outstanding.

Do not rerun the migration blindly: its constraint and trigger operations assume the inspected pre-migration schema.

## 9. Security / RLS

Saves/deletes bind to authenticated evaluator ownership and legitimate assignments. Finalization reuses coordinator permissions/scope and row locks. Students are restricted to their own released version.

Executed production read-only role-context checks: owner student saw one final version, six legacy scores and one final review, not three historical versions; another student saw zero evaluations/versions and no PDF report.

Executed a rollback-only backend lifecycle test: partial draft, own-draft deletion, missing-period rejection, complete 18-score submission, authorized finalization, frozen individual report without aggregate, and finalized-delete rejection all passed. No test grades were committed.

After all tests, existing counts remained: one evaluation, three versions, 18 scores and two reviews. Both official templates are active with 18 criteria each.

Dependency hardening upgraded React/RSC to 19.2.8, Vinext to 1.0.0-beta.9, Vite to 8.2.2, the Cloudflare Vite plugin to 1.54.4, Wrangler to 4.129.0 and Nitro to 3.0.260903-beta. Linked peers were upgraded together. `npm audit` now reports zero known vulnerabilities; no forced audit upgrade was used.

## 10. Files changed

- app/PraxizApp.tsx: page integration, reports, status/search filters and confirmations.
- app/components/EvaluationWorkspace.tsx: official/legacy editor and lifecycle.
- app/components/EvaluationPdfDownload.tsx: authenticated PDF download feedback.
- app/components/Dialog.tsx: native modal focus, Escape and focus restoration; reused in 18 existing dialogs.
- app/components/StudentAttendanceHistory.tsx: authorized full history.
- app/components/InstitutionalBrowser.tsx: hierarchy and separate terms.
- app/services/praxiz-services.ts: typed data mapping and RPC calls.
- app/auth/supabase-auth.tsx: branded loading presentation.
- app/data.ts: registrations navigation label.
- app/globals.css: semantic themes, responsive layout and accessibility.
- app/api/evaluations/[id]/pdf/route.ts: private PDF endpoint.
- lib/evaluation-report.ts, report-assets.d.ts and report-assets: report generation/types/font/seal/license.
- lib/user-error.ts: human-readable errors.
- database/20260904_official_evaluation.sql: schema/workflow changes.
- tests/evaluation-report.test.mjs: six new regression checks.
- package.json/package-lock.json: PDF dependencies, synchronized security updates and npm10-compatible lock maintenance.
- public/branding and public/sdgs: supplied assets.
- docs/refinement-ver2.md: this report.

## 11. Mock / placeholder data removed

Removed static database-health assertions, the assumed dashboard 400-hour fallback, misleading hard-coded current-term analytics and generic report cards exporting the same dataset. Official evaluation no longer displays an invented grade percentage. Progress uses finalized evaluation counts.

Editable assignment-creation defaults are not saved records. Missing names now show Name not recorded; no identities or production records were fabricated. PDF QA fixtures are labeled test-only.

## 12. Validation results

- Typecheck: PASS.
- Lint: PASS.
- Normal production build: PASS.
- Local Vercel build: PASS.
- Automated tests: PASS — 47/47.
- Migration SQL parsing: PASS, 38 statements.
- Production migration/publication: PASS.
- Backend lifecycle/RLS rollback tests: PASS as detailed above.
- Anonymous PDF request: HTTP 401; invalid identifier: HTTP 404.
- Standard two-page PDF visual check and long-remark pagination: PASS.
- Signed-in admin account/registration/hierarchy/settings checks: PASS.
- Native modal initial focus, Escape and focus restoration: PASS.
- Public/sign-in/settings checks at approximately 375/768/1024/1440px: PASS for inspected layouts.
- Cloud deployment: PASS — READY and aliased to praxiz.vercel.app.
- Live HTTP checks: landing/sign-in/logo 200; anonymous PDF 401. Browser reload confirmed the new supplied branding on production sign-in.
- npm audit: PASS — 0 known vulnerabilities after compatible package updates.

First cloud attempt failed because npm11's lockfile omitted Nitro's optional lru-cache dependency. Regenerated the lock with npm10.9.9; npm10 clean-install dry-run passed, and deployment was retried. The retry completed successfully on Vercel’s Node22/Linux builder.

The security-updated deployment was built first as preview dpl_D7LoFgVdLgf4oUfsPrMPPRhDY5PC, checked live, and then promoted. Production deployment dpl_DzhAZU6Pied1FQAAfipgMmS2gDEA is READY and owns the praxiz.vercel.app alias. The production builder also reported zero vulnerabilities.

Build warnings remain for large client chunks and framework dynamic imports; these are not test failures.

## 13. Remaining work

- Complete browser-level Student/Coordinator/HTE attendance, document, notification and evaluation journeys using authorized accounts; backend rollback tests do not replace all-role UI tests.
- Download a finalized report through the authenticated browser endpoint using an authorized account.
- Authenticate Supabase CLI and regenerate full database types. Do not paste tokens or passwords into chat.
- Local source changes are preserved but have not been committed or pushed to GitHub in this task; deployment was made from the local working tree.

## 14. Manual deployment checklist

1. Confirm public deployment readiness and inspect the actual praxiz.vercel.app landing/sign-in.
2. Check desktop/mobile sign-in and role redirects.
3. HTE/coordinator: verify assigned interns, all 18 official criteria, partial draft, submit/return/finalize and draft deletion; unrelated assignment access must fail.
4. Student: only own finalized report/PDF, no edit/delete and no draft-history access.
5. Check attendance confirmations/cancellation, immutable server timestamps, history/CSV, Daily Log Draft/Submit/review and document sections.
6. Check notifications, institutional hierarchy/terms, account/HTE filters and every theme/accent at all target widths.
7. Generate schema types after CLI login. Use npm10 for lock maintenance and run typecheck/release checks before subsequent deploys.
8. Preserve historical forms and prior deployment for recovery; never use a destructive database reset.

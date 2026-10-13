# PRAXIZ V25 implementation tracker

Updated: 2026-10-13 (Asia/Manila)

## Execution rules

- Preserve current Supabase data, RLS, attendance events, verification records, assignment snapshots, and audit history.
- Keep Student Intern, Internship Coordinator, HTE Representative, Placement Head, and System Administrator as the only application roles.
- Treat the Stitch files as visual references, not replacement application source.
- Use one A4 portrait PRAXIZ monthly DTR based on one Form 48 form. The duplicate form and instructions page are excluded.
- Never infer a time-out, break, absence, verified duration, daily hours, or total hours.
- Apply database changes only through the additive reviewed migration. The repository implementation does not apply production migrations automatically.

## Issue-to-code traceability

| V25 pages / section | Existing module | Baseline behavior / root cause | Planned action | Priority | Dependency | Verification | Status |
|---|---|---|---|---|---|---|---|
| p.1 - shared sidebar | `app/PraxizApp.tsx`, `app/globals.css` | Expanded state persists; an earlier negative-offset toggle could clip between the sidebar and page. | The authoritative responsive cascade keeps the toggle inside the sidebar, always visible on desktop, retains explicit persisted user control, and preserves the mobile drawer. | P1 | Shared shell | Existing V22/V23 static tests; authenticated cross-role browser QA remains | Fixed in code; live role QA pending |
| pp.2-3 - HTE work setup | `HteWorkSetupPage`, `hteWorkSetupService`, V21/V22 migrations | V24 stacked the surfaces, but active-record selection was not explicitly term/effective-date aware and history detail was minimal. | Applicable records now use HTE + effective period + current term precedence; overlaps are disclosed, save reloads, initial/stored reasons display, and View details is read-only. | P1 | Existing work-config RPC | V25 static tests; live role QA remains | Fixed in code; live QA pending |
| p.4, pp.19-40 - monthly DTR | `AttendancePage`, `MonthlyDtrWorkspace`, `monthly-dtr-service`, DTR API/PDF, V25 migration | Server timestamps, corrections, and session verification existed, but no monthly report/version/submission model existed. | Added additive frozen report/version/submission schema, scoped RPCs, one-form A4 PDF, role workspaces, explicit confirmation, and idempotent Student/HTE submission. | P0 | Pending reviewed production migration | 28/29/30/31 tests, static PDF test, rendered A4 fixture, dry-run migration check | Implemented; migration/live role QA pending |
| p.5 - sign-in copy/alignment | `SignInPage`, auth CSS | Functional email/password sign-in existed; footer wording exposed the backend provider. | Replaced it with institutional secure-verification copy without changing authentication. | P1 | Shared auth shell | Typecheck/build and local browser review | Fixed and visually verified |
| pp.6-7 - Weekly Log evidence | Weekly Log dialog/service/schema | Weekly Logs are versioned and reviewed; private photo evidence with provenance is absent. Institutional policy does not state whether evidence is mandatory. | Add an optional evidence foundation only; do not make it blocking without institution approval. | P2 | Storage/RLS policy decision | Upload ownership and metadata tests | Blocked - policy decision for mandatory/optional enforcement; optional is safe |
| pp.7-8 - Coordinator requirements | requirement UI/RPCs, V18/V22 migrations | Scoped requirement records and immutable assignment snapshots already exist. | Existing V23 flow keeps propagation unchecked, confirms the selected scope and affected count, and updates only matching active assignments. | P1 | Existing requirement RPC | Existing V22/V23 tests | Already correct |
| pp.8-9 - Coordinator dashboard spacing | dashboard grid/chart CSS | Cards inherited stretching from grid rows, creating blank vertical space. | Shared dashboard and chart grids now align items to the start so cards keep natural height without changing metrics. | P2 | Shared dashboard CSS | Existing responsive CSS/static tests; authenticated visual QA remains | Fixed in code; live role QA pending |
| p.9 - bulk assignment | assignment dialog, `coordinatorService`, V25 migration wrapper | Previous UI and RPC created one student assignment per request. | Added 2–50 student selection, per-student scoped requirement resolution and an atomic wrapper around the existing authorized single-assignment RPC; any failure rolls back the batch. | P1 | Pending reviewed production migration | V25 migration/UI contract tests; live transaction QA pending | Implemented; migration/live QA pending |
| p.10 - Weekly Log table | Weekly Log table/detail | Reviewed rows still exposed Review wording/actions. | Long previews remain clamped, short text remains verbatim, Submitted rows retain Review, and every other non-student row opens read-only View details. | P2 | Existing log versions | V25 UI contract test | Fixed in code |
| pp.11-18 - Coordinator AI | AI routes, `lib/ollama.ts`, analytics UI | V24 centralized safe errors and strict parsing. Production authenticated model generation is still not verified. | Added safe stage/code/duration diagnostics while retaining authoritative analytics and typed provider failures. | P0 | Reachable production Ollama and QA account | Existing runtime tests and V25 diagnostic test | Diagnostics fixed; production provider unverified |
| p.18 - Placement Head reset link | auth provider and password pages | A current browser session was checked before consuming a recovery/invite credential, so another signed-in account could mask the new link. | Consume PKCE/hash/recovery/invite credentials first, bind the temporary recovery state to the recovery user in session storage, reject ordinary signed-in sessions, clear credentials, expose checking/invalid/ready states, and retain safe request-new-link recovery. | P0 | Supabase redirect allowlist and QA invitation | V25 auth-order test; invalid-link browser check; real link pending | Root cause fixed in code; live link QA pending |
| Required File Distribution permission | `PlacementWorkspace`, placement service, V21/V22 RLS/RPC | Admin workflow exists; the reported 403 requires live policy-path confirmation. | Trace exact read/publish RPC and return distinct empty/forbidden/network states; avoid broad grants. | P0 | Authenticated Admin QA | Direct RLS tests | Not verified |
| Coordinator Placement Compliance / Records permission | `PlacementWorkspace`, placement service, V21/V22 policies | Coordinator read/submit history paths exist but reported 403 requires exact role/scope reproduction. | Verify coordinator scope functions/RLS, repair narrow policy or query mismatch, retain Placement Head-only review. | P0 | Authenticated Coordinator QA | Isolation and storage tests | Not verified |
| HTE generated reference | provisioning route and V23 migration | Generated PRAXIZ HTE reference and optional external identifier already exist. | Preserve and regression-test. | P1 | None | Existing V23 tests | Already correct |
| Academic-term lifecycle | admin term UI and V21 migration | Explicit Admin transitions exist; earlier stage endpoints lacked balanced padding. | Existing final cascade supplies inset lifecycle padding, connector spacing and mobile wrapping without changing transitions. | P2 | Existing lifecycle | V21/V23 static tests; authenticated visual QA remains | Fixed in code; live role QA pending |
| Terms / Privacy | `PolicyPage` | Earlier pages used repetitive stacked cards. | Existing document heading, numbered sections, desktop contents navigation and compact mobile layout satisfy the V25 presentation requirement. | P2 | Shared public shell | Typecheck/build and code review | Already correct |

## Architecture and dependency order

1. Preserve attendance events and verification records as the only time evidence.
2. Add an append-only monthly DTR report/version model and one idempotent submission relation.
3. Build a pure monthly snapshot/PDF layer and test it with explicit fixtures.
4. Expose server-authenticated PDF preview/download from the same report/version identifier.
5. Add Student, HTE Representative, and Coordinator monthly DTR interfaces to the existing Attendance route.
6. Complete narrow auth/permission diagnostics and shared layout refinements.
7. Run lint, typecheck, tests, production build, PDF render inspection, and responsive browser checks.

## Policy questions

- Weekly Log image evidence is implemented as optional unless PSU formally requires it. The supplied material does not authorize making location or photography mandatory.
- A fully verified monthly DTR requires every included non-voided session to have a complete authoritative pair and an HTE verification. Documented exclusions need a separate approved institutional rule before they can count as fully verified.
- The generated PRAXIZ DTR is adapted from the Form 48 layout and is not described as an officially approved CSC Form 48.

## Baseline

- Unit/integration tests: 157 passed.
- TypeScript: passed.
- Existing attendance controls: server-generated events, no automatic time-out, stale sessions become `incomplete`, one authoritative original/corrected pair, and verified minutes are database-calculated.
- Existing production AI code: centralized provider configuration and typed failures are present; authenticated production generation remains unverified.

## Implemented V25 slices

### 1. Monthly DTR foundation

- `supabase/migrations/20261013000000_v25_monthly_dtr.sql`: additive report/version and idempotent submission tables, RLS, trusted scope helpers, frozen snapshots, explicit HTE finalization, correction/revision path, Student/HTE submission, audit triggers, and atomic bulk assignment wrapper.
- `lib/monthly-dtr-report.ts`: pure one-page A4 generator with day 1–last rows, multiple-session display, no-record days, recorded/verified separation, provisional watermark, verified certification, and no editable PDF fields.
- `app/api/dtr/[id]/pdf/route.ts`: authenticated no-store preview/download endpoint using the same immutable report version.
- `app/services/monthly-dtr-service.ts` and `app/components/MonthlyDtrWorkspace.tsx`: Student, HTE Representative, Coordinator and Administrator surfaces with explicit finalization/submission confirmations and honest loading/empty/error states.
- `output/pdf/PRAXIZ-V25-Monthly-DTR-Fixture.pdf`: non-production verified fixture used only for visual and print-layout QA.

### 2. Security and workflow repairs

- `app/auth/supabase-auth.tsx` and reset-password UI: recovery/invite credentials are consumed before any existing browser session; only an explicit recovery event/session can unlock the form; checking, invalid/used/expired, and ready states are distinct.
- `HteWorkSetupPage`: effective period and current term determine Current setup; overlapping configurations are disclosed; complete version details are read-only.
- Assignment dialog and `coordinatorService`: optional multi-select uses individually resolved requirement snapshots and a transactional backend wrapper; existing one-student behavior remains available.
- Weekly Logs: only Submitted records expose review actions; approved/rejected/revision records open read-only details.
- AI analytics route: safe failure logs now include stage, typed code and duration without prompts, provider URLs, credentials or user data.

## Migration and rollback considerations

- The V25 migration is pending and has not been applied by this implementation pass. `supabase db push --dry-run` reports only `20261013000000_v25_monthly_dtr.sql` as pending.
- The change is additive. Do not drop the new tables after production records exist. If deployment must be rolled back before use, remove the new grants/functions/policies/triggers first, then the empty submission/report tables. Once reports exist, preserve them and roll the application back without deleting data.
- No storage bucket is added: PDFs are generated from authorized frozen database snapshots on demand. Responses are private and `no-store`.

## Verification record

- Baseline suite: 157 passing tests.
- Final suite after V25 changes: 166 passing, 0 failing.
- TypeScript and ESLint passed after the final recovery-session hardening.
- The production application build completed successfully and includes the protected `/api/dtr/:id/pdf` route. The build retains pre-existing Vite native-config and large-chunk warnings.
- Local browser verification confirmed the compact sign-in layout and nontechnical security copy, and confirmed that `/reset-password` without a real recovery credential shows the invalid/used/expired state even when an ordinary session exists.
- Linked database lint returned only three pre-existing warnings (`private.audit_safe_row`, and unused `p_is_current` parameters in the existing term functions).
- The verified DTR fixture was rendered through Poppler and visually inspected: one A4 page, 31 calendar rows, readable multiple/overnight sessions, no duplicate form, no instructions page, no form fields, and no JavaScript.

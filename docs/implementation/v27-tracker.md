# PRAXIZ v27 implementation tracker

Last updated: 2026-10-16 (Asia/Manila)

## Evidence baseline

- Read the complete v27 master prompt and page-by-page index from the supplied bundle.
- Extracted and inspected all 275 pages of `v27.pdf`, including all screenshots.
- Rendered and inspected all 13 pages from the nine supplied institutional Word forms. Originals were not modified.
- Repository baseline: `npm test` passed (178 tests), `npm run lint` passed, and `npx tsc --noEmit` passed.
- Linked Supabase migration history matches the repository through `20261015000000_v26_placement_head_invitation.sql`.
- Production was initially inspected read-only; after the complete release gate and explicit deployment authorization, the three reviewed v27 migrations were applied without seeds or role resets.
- Database dump was unavailable because Docker is not running; linked table statistics and migration history were still verified.

## Status legend

- `verified`: implemented and supported by recorded test evidence.
- `in progress`: active implementation or verification.
- `pending`: inspected and queued; not yet claimed complete.
- `blocked`: requires an institutional decision, missing asset, or explicit production approval.

## Work-package disposition

| Package                          | PDF pages | Priority/type              | Status                   | Current evidence and next action                                                                                                                   |
| -------------------------------- | --------: | -------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| PH-01 Placement Head Dashboard   |       1–6 | UI, analytics              | locally verified         | Added compact campus/college/term filters, scoped summary metrics, hierarchy, honest empty states, and a five-item action-required surface.          |
| PH-02 Placement Head Students    |      7–14 | UI, authorization          | locally verified         | Scoped search/filters, count, ten-row pagination, local table scrolling, missing-data labels, and an in-app read-only detail dialog are verified.   |
| PH-03 Document Compliance        |     15–26 | workflow, security         | locally verified         | Added filtered summary cards, coordinator identity, context-aware secure view/review actions, honest empty states, and immutable version history.    |
| PH-04 Required File Formats      |     27–36 | documents, storage         | locally verified         | Existing controlled library preserves secure preview/download, immutable version history, return-with-feedback, and administrator publication.     |
| PH-05 AI Analytics               |     37–47 | analytics, resilience      | locally verified         | Verified metrics render independently of optional AI; scoped selectors, advisory separation, and typed failure handling are covered by tests.       |
| CO-01 Document Compliance        |     48–56 | workflow, filters          | locally verified         | Search, section, HTE, academic-term, and status filters combine over assignment-derived metadata; progress and phase groups respond to the view.    |
| CO-02 Placement Compliance       |     57–64 | workflow, UI               | locally verified         | Separate module with summary, search/status filters, upload/resubmit, review feedback, secure file view, and retained version history.              |
| CO-03 Records Management         |     65–74 | retention, audit           | locally verified         | Read-only records group each coordinator/requirement on its latest version while exposing every retained version and reviewer feedback.             |
| CO-04 Partner HTEs               |     75–84 | configuration, UI          | locally verified         | Partner list and details show authorized daily hours from the scoped HTE configuration, distinctly from coordinator-owned total internship hours. |
| CO-05 Weekly Logs                |     85–96 | P0 privacy, workflow       | locally verified / staging UI pending | Draft privacy is database-tested; search/status/sort history and review/detail surfaces are implemented without widening reviewer access.           |
| CO-06 Performance Analytics      |    97–106 | analytics, AI              | pre-existing locally verified | Deterministic metrics use RLS-visible records and explicit denominators; scoped views, no-data states, rule-based risks, and optional AI remain separated. |
| CO-07 Feedback and Follow-up     |   107–116 | workflow, UI               | locally verified         | Read and follow-up states are separate; search/section/HTE/workflow/read filters combine; details open in PRAXIZ and remain read-only for Students. |
| ST-01 Form 48 DTR                |   117–126 | PDF, attendance            | verified                 | One 306×936 front-only original form; four-column actual-punch mapping, month lengths, undertime rules, overflow refusal, and rendered footer verified. |
| ST-02 Weekly Logs/Photo Evidence |   127–139 | P0 privacy, storage        | locally verified / staging UI pending | Draft text, metadata, evidence, audit, and Storage objects are private and database-tested; upload validation, policy snapshot, exception, and review flows remain scoped. |
| ST-03 Documents Unsubmit         |   140–146 | P0 transaction, audit      | in progress / blocked    | Transaction, history, UI confirmation, and replacement-ready state implemented locally. No-deadline withdrawal remains denied pending policy.     |
| ST-04 Evaluations PDF            |   147–153 | PDF, authorization         | verified                 | Finalized-only database/API path, actual release timestamp/period, and separate secure View/Download actions verified locally.                      |
| ST-05 Feedback Details           |   154–161 | UI, workflow               | pre-existing locally verified | Compact in-app dialog uses structured metadata, preserved message text, explicit close, independent status badges, and no Student edit control.    |
| SH-01 AI Assistant Modal         |   162–169 | UI, resilience             | pre-existing locally verified | Bounded flex dialog, scrolling conversation, anchored composer, welcome suggestions, typed loading/error/retry, and safe Markdown are covered.     |
| SH-02 Mobile Notifications/AI    |   170–177 | responsive UI              | pre-existing locally verified | Notification filters/cards and full-height mobile AI layout use responsive breakpoints; trigger/toast offsets avoid bottom-right overlap.          |
| SH-03 Collapsible Sidebar        |   178–183 | navigation, accessibility  | pre-existing locally verified | User-controlled expanded state, persisted preference, active-route semantics, collapsed tooltips, mobile drawer, focus trap, and all-role shell are present. |
| AD-01 Administrator Dashboard    |   184–194 | analytics, UI              | pre-existing locally verified | Live metric definitions, compact cards, quick actions, 24-hour audit total, pending-registration attention area, responsive shell, and authorized links are present. |
| AD-02 Registrations              |   195–207 | auth, invitations          | locally verified         | Pending work is prioritized with summary counts; reviewed rows open read-only decision details; references and invitation-only creation remain preserved. |
| AD-03 HTE Work Configurations    |   208–219 | data integrity             | locally verified         | Filters, compact current state, explicit correction mode/reason, opt-in active propagation, confirmation, immutable history, and safe snapshots are verified. |
| AD-04 Required File Distribution |   220–228 | documents, storage         | locally verified         | Secure preview/download, version history, administrator publication, return-with-feedback, and format validation are covered by the release suite. |
| AD-05 Templates/Forms/Resources  |   229–243 | official forms, resolution | in progress / blocked    | Arbitrary first-template selection is blocked. Exact campus/college/program scope publication awaits configured institutional applicability.       |
| AD-06 Support Inbox              |   244–255 | delivery, privacy          | locally verified / staging pending | Read and case state are separated; server-authorized provider reply, history, audit, rate-limit, privacy warning, filters, resolve/reopen, and truthful failure/acceptance states pass local tests. |
| HTE-01 Internship Work Setup     |   256–265 | configuration, history     | locally verified         | Current setup is compact; configure/update/correct explicitly opens a prefilled editor; propagation is opt-in and correction reasons/history remain preserved. |
| HTE-02 Weekly Logs/Photo Policy  |   266–275 | P0 privacy, review         | locally verified / staging UI pending | History is prioritized with search/status/sort; policy editor is conditional/prefilled and future-only impact requires a second confirmation. Draft RLS is database-tested. |

The supplied `V27_PAGE_BY_PAGE_REQUIREMENTS_INDEX.md` remains the numbered acceptance checklist for every item inside these 28 packages. An item is checked only after its implementation and verification evidence are added here.

## Phase 1 change log — security and data correctness

### Completed locally

- Added a state-aware Weekly Log read predicate.
- Added a restrictive draft boundary to logs, immutable versions, and reviews.
- Replaced broad v26 evidence, exception, audit, snapshot, and private Storage read policies with log-state-aware policies.
- Preserved Student ownership of drafts and existing assignment scope after submission.
- No existing row, attendance timestamp, document version, evaluation, or assignment was rewritten.

### Verified locally

- The initial Phase 1 gate passed the production build and all 178 application regression tests; the consolidated Phase 4 gate below supersedes that count.
- `npm run lint` and `npx tsc --noEmit` pass.
- `npm run test:photo-database` passes, including migration replay.
- Student owner can read a draft and its private object.
- Assigned HTE and Coordinator cannot read draft text, metadata, evidence, audit rows, or object content.
- Both reviewers regain their existing scoped access after submission.
- `npm run test:document-database` passes ownership, current-version, deadline, review-lock, immutable-history, and migration-replay contracts.
- Document withdrawal UI exposes a confirmation action only when the client can establish eligibility; the RPC independently rechecks every rule under row locks.

## Phase 2 change log — Form 48 correctness

### Completed and verified locally

- Preserved the exact original Civil Service Form No. 48 artwork and generated exactly one narrow 306×936-point front page.
- Removed only the obsolete “(See Instructions on back)” phrase from generated output; certification, signature lines, and In-Charge designation remain visible.
- Increased overlay readability while retaining measured centering and safe fitting.
- Preserved four distinct A.M./P.M. arrival/departure fields from actual Manila-time punches. Continuous noon-spanning sessions do not fabricate lunch punches.
- Unverified or incomplete sessions and missing authorized daily-hour policy leave undertime blank.
- Overfilled attendance cells fail with an explicit authorization/review message instead of truncating or inventing punches.
- Added automated coverage for A.M.-only, P.M.-only, continuous, split, missing-time-out, overnight, overfilled-cell, and 28/29/30/31-day cases.
- Rendered the generated PDF at 200 DPI and visually checked the full table and footer against the supplied original. The output remains a single page with no form fields.

## Phase 3 change log — finalized evaluation reports

### Completed and verified locally

- Confirmed guessed evaluation IDs cannot bypass authentication, assignment scope, deleted-record checks, or finalized status in `get_finalized_evaluation_report`.
- Preserved the Coordinator finalization event as the authoritative release event and the immutable `finalized_report` snapshot as the PDF source.
- Student rows now show the stored evaluation title, HTE evaluator, rating period, actual finalization/release timestamp, and finalized status.
- Added separate **View PDF** and **Download** actions. The in-system viewer retains internal scrolling, close behavior, open-in-new-tab, and an explicit download of the same fetched immutable version.
- `tests/evaluation-report.test.mjs` passes its expanded coverage, including static PDF structure, lifecycle/RLS guards, finalized-only access, split preview/download behavior, and ambiguous-template refusal.

### Template-resolution safety

- Removed the unsafe client behavior that silently selected the first active HTE evaluation template.
- A single active form remains usable; zero forms produces the existing honest empty state; multiple matching active forms now block evaluation creation with an explicit conflict message.
- Full campus/college/program/term applicability cannot be inferred from the supplied document filenames. Publishing those institutional scope mappings remains blocked until authorized applicability is configured; no college policy was invented.

### Verification still required

- Apply to staging and perform role-by-role browser checks before requesting production approval.

## Phase 4 consolidated release gate

### Verified locally on 2026-10-16

- `npm run release:check` exited successfully.
- ESLint passed with no errors.
- The complete application suite passed **182/182** tests after replacing the superseded v9 assertion that forbade the v27-required separate Download action.
- Weekly Log/photo evidence database contracts passed, including migration replay, private draft text/metadata/evidence/audit/storage, reviewer access after submission, and required-hour propagation safety.
- Document withdrawal database contracts passed, including ownership, current-version, deadline, review-lock, immutable-history, and replay behavior.
- The Vercel production-target build completed successfully and generated `.vercel/output`.
- Build diagnostics still report non-fatal bundle-size and dependency-tracing warnings; these did not fail compilation or the release gate and are not represented as resolved performance work.

## Phase 5 change log — Support Inbox workflow

### Completed and verified locally

- Added independent immutable read and case-state fields without deleting or replacing legacy messages; legacy `read`/`resolved` rows are conservatively backfilled.
- Replaced direct client status updates with System-Administrator-only security-definer RPCs. Read, resolve, and reopen transitions retain actor/timestamp events; reopening does not erase the read state.
- Added immutable reply-attempt history with explicit `attempting`, `accepted`, or `failed` delivery state. Database constraints prevent an accepted state without both a provider identifier and acceptance timestamp.
- Added `/api/support/reply`, which revalidates the active System Administrator role server-side, fixes the recipient to the original message address, requires a configured service key/Resend key/sender, validates inputs, applies a database-backed five-attempts-per-ten-minutes rate limit, and uses a stable idempotency key.
- Provider rejection and transport failures are stored and shown as failures. Success says only **accepted by the configured email provider**; it does not claim recipient delivery.
- The UI now separates Unread/Read from Open/Resolved, adds filters, response history, Resolve/Reopen, and a privacy acknowledgement warning that the public contact address is unverified and must not receive private account or internship data.
- `npm run test:support-database` passes migration replay, unauthorized denial, read/case independence, idempotent transitions, immutable events, and truthful acceptance constraints.
- The expanded application suite passes **184/184** tests; TypeScript, ESLint, the vinext production build, and the Vercel-target build pass.

### Staging/production gate

- Migration `20261016020000_v27_support_inbox_workflow.sql` is applied to staging and production.
- A real reply requires valid `RESEND_API_KEY`, `CONTACT_EMAIL_FROM`, and `SUPABASE_SERVICE_ROLE_KEY` server environment variables. Provider acceptance and a test-mailbox receipt must be verified in staging before production approval.

## Known blocked decisions / production gates

1. Student document withdrawal when `due_at` is null: institutional policy is not supplied. The safe implementation will deny withdrawal until policy is confirmed.
2. Production migrations were dry-run first, then applied as the exact reviewed three-migration set. Application deployment and production smoke verification remain the release gate.
3. Missing official resource files, if any are required beyond the nine supplied forms: do not fabricate replacements.

## Phase 6 change log — staging migration and v27 placement/HTE polish

### Completed and verified locally

- Linked the CLI to the dedicated `PRAXIZ-STAGING` project and reconciled its pre-v27 migration history without replaying or rewriting existing v26 schema/data.
- Applied the three v27 migrations to staging only. `supabase migration list --linked` now shows all local and staging versions aligned through `20261016020000`.
- HTE Work Setup now keeps the form hidden until Configure, Update, or Correct is selected; current values are prefilled and successful saves return to the compact current-state view.
- HTE Weekly Logs now place the review history before configuration, add search/status/sort controls, and keep photo-policy changes in a compact, explicit, two-step future-only workflow.
- Placement Head Dashboard now provides institutional filters and a compact action-required table; Student Overview now provides counts, pagination, and a read-only detail dialog without expanding authorization scope.
- The consolidated application suite passes **188/188** tests before the final Placement Head additions; the focused v27 Placement/HTE suite passes **8/8** tests and TypeScript passes afterward. A final full release check is required immediately before deployment.

### Staging UI gate

- The staging-targeted app is running locally on port 3002 and the public sign-in page renders correctly.
- Authenticated role-by-role browser verification requires a staging test-account session; no credential was requested, entered, or stored by Codex.
- Production remains unchanged and the repository CLI intentionally remains linked to staging.

## Phase 7 consolidated pre-deployment gate

### Completed and verified locally on 2026-10-16

- Partner HTE records now expose authorized daily required hours from `hte_daily_hour_configs` while keeping total internship hours assignment-owned.
- Registration review prioritizes pending work and retains read-only decision history for reviewed records.
- Feedback now displays and filters independent follow-up and read states; the superseded v9 assertion was updated to enforce the v27 model.
- Placement Head student pagination resets in control event handlers, satisfying the React hooks rule without a cascading effect.
- `npx tsc --noEmit` passed.
- All focused v27 checks passed **23/23**.
- `npm run release:check` passed: ESLint, production build, **205/205** application tests, all three database contract/replay suites, and the Vercel-target build.
- Non-fatal builder diagnostics remain for bundle size, optional dependency tracing, and Windows-native build tracing; they do not represent failed compilation or a falsely claimed resolution.

### Production database deployment

- The dry run listed exactly `20261016000000`, `20261016010000`, and `20261016020000`; it listed no seeds or role changes.
- Those three migrations were applied successfully to production, and the post-apply migration list matches the repository through `20261016020000`.

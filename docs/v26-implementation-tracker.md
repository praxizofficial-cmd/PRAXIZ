# PRAXIZ v26 implementation tracker

Updated: 2026-10-15

## Safety baseline

- Repository baseline: `2140a87` on `main`; clean and synchronized before v26 work.
- Supabase migrations: local and linked migration histories matched through `20261013000000`.
- Linked database lint: no errors; three pre-existing warnings remain in legacy functions.
- Baseline release check: lint passed, 166 tests passed, and the production build passed.
- Production rows were not inspected or modified: this workspace has no service-role credential, and a linked schema dump could not run because Docker Desktop is unavailable.
- No destructive database operation is permitted for this pass. All v26 schema work must be additive and preserve historical attendance and assignments.

## Page-by-page audit and implementation checklist

| v26 pages | Area | Baseline status | Verified root cause / implementation dependency | State |
| --- | --- | --- | --- | --- |
| 2–9 | Password recovery | Partial / broken layout | `ResetPasswordPage` still uses the old split-screen shell. Recovery and invitation token handling are mixed in one verifier. | In progress |
| 10–11 | Placement Head invitation | Broken | Initial-load invite verification was confirmed in code. Premature consumption by email scanners remains an unconfirmed hypothesis; mail-provider logs and a dedicated pending test account are unavailable. Explicit acceptance is implemented locally. | In progress |
| 12–16 | Registration review | Partial | Review data omits name, campus, college, and separate year/section; ordinal text is assembled as `yearLevel + "th"`; confirmation copy exposes the backend vendor. | In progress |
| 17–32 | Registration success | Partial | Direct navigation renders a false successful-submission state. Container is narrower than the v26 reference and the copy conflates format, mailbox ownership, and institutional approval. | In progress |
| 33–35 | Digital DTR / Form 48 | Broken against v26 | Current PDF generator creates a custom wide A4 PRAXIZ report. The supplied Form 48 has two narrow forms per front page; v26 requires one original narrow front form using only authoritative attendance. | Pending |
| 38–45 | AI assistant modal | Mostly implemented | The modal already uses a bounded flex layout and independent transcript scrolling. Remaining work is focused mobile viewport/safe-area hardening and non-disruptive auto-scroll verification. | Pending |
| 47–54 | Required hours | Mostly implemented / production data uncertain | v22 already snapshots assignment hours and provides scoped active-only propagation with audit. The UI needs a true “not configured” state and an impact preview/reason before an explicit propagation. Existing private production rows cannot be read from this unauthenticated workspace. | Pending |
| 55–71 | Weekly Log photo evidence | Missing | No photo-evidence table, private bucket, organization policy snapshot, exception workflow, or reviewer decision model exists. This requires an additive migration, scoped RLS, storage policies, service methods, and role-specific UI. | Pending |
| 72 | Release verification | Pending | Run focused tests after every phase, then lint, the full suite, production build, migration parity/lint, and targeted browser/PDF checks. | Pending |

## Authorization and data rules

- Student Interns may upload, caption, replace, and remove their own evidence only while a weekly log is editable.
- HTE Representatives may configure organization evidence policy and review evidence/exceptions only for assignments in their authorized HTE scope.
- Internship Coordinators may monitor evidence completeness inside their academic scope, but must not approve or reject HTE evidence.
- System Administrators retain technical oversight without bypassing attendance immutability or fabricating review outcomes.
- Attendance timestamps, attendance history, completed/cancelled assignments, historical required-hour snapshots, and submitted log versions must remain immutable.
- Photo evidence must use private storage and signed access after database authorization; EXIF/GPS and AI are not treated as proof.
- Missing or invalid required hours must display as not configured rather than silently falling back to 400.

## Phases and verification gates

### Phase 1 — Invitation, password setup, and registration

- [x] Implement a GET-safe `/accept-invitation` page; source tests confirm verification occurs only after an explicit user action.
- [x] Separate invitation and recovery session markers and password-update validation (local checks).
- [x] Move reset/password-setup states into the compact centered authentication shell.
- [x] Point new privileged invitations at `/accept-invitation` in source.
- [x] Add a no-referrer policy and a deployment-ready Supabase invitation-template artifact.
- [x] Correct registration review fields, ordinal labels, copy, layout, and direct-navigation success handling.
- [ ] Add focused tests; run lint, affected tests, and a production build.

### Phase 2 — Authoritative single-form Digital DTR

- [x] Rebuild the PDF output as exactly one narrow portrait Form 48 front; PDF structure test passed.
- [ ] Populate only verified source fields; leave unsupported fields and signatures blank.
- [ ] Preserve the existing DTR viewer/download/review workflow.
- [x] Render the generated PDF and visually compare it with the supplied form; repeated after correcting the printed century prefix on 2026-10-14.
- [ ] Update focused PDF tests and run the phase gate.

### Phase 3 — AI modal and required-hour synchronization

- [x] Implement AI transcript/composer rules for mobile dynamic viewports and user-controlled scrolling; device verification remains open.
- [x] Display missing/invalid required hours as not configured.
- [x] Implement scoped impact preview and required audit reason for explicit active-assignment propagation; migration remains unapplied.
- [ ] Verify matching active assignments update while historical/completed/cancelled rows do not.

### Phase 4 — Daily Activity Photo Evidence in Weekly Logs

- [ ] Add organization policy, assignment policy snapshot, evidence, exception, decision, and audit structures.
- [ ] Add a private storage bucket with owner/scoped-review access policies.
- [ ] Validate actual content type, byte size, image dimensions, assignment/date scope, and editable state.
- [ ] Add student upload/caption/preview/replace/remove and exception request UI.
- [ ] Add HTE approve/reject and policy UI; add coordinator read-only completeness monitoring.
- [ ] Lock submitted evidence versions and verify that evidence does not alter attendance.

### Final release gate

- [ ] All focused tests pass.
- [ ] Full release check passes.
- [ ] Linked migration history remains safe and ordered; database lint has no new warnings.
- [ ] Responsive smoke checks cover phone, tablet, and desktop for every modified page.
- [ ] No live template, production data, or production migration is changed before the matching application version is deployed.

## Change log

### Local implementation through 2026-10-14

- Auth/registration: explicit invitation acceptance, separated recovery/invitation state, centered password setup, complete registration review, truthful direct-navigation success state. Changed `app/auth/supabase-auth.tsx`, `app/PraxizApp.tsx`, `app/api/accounts/provision/route.ts`, `app/layout.tsx`, and styles. Added the invitation template under `docs/`. Focused tests, lint, and production build passed in the earlier phase. Real invitation delivery, acceptance, password setup, and trusted Placement Head login remain **unverified**. Deploy the acceptance route before changing the live invite template.
- DTR: original supplied Form 48 copied into `lib/report-assets/`; generator uses one narrow 306 × 936 point front form, preserving blank unsupported/signature fields. Viewer retained. Focused tests and rendered visual inspection passed. Final browser print and full attendance edge-case coverage remain outstanding.
- AI: transcript scroll respects users reading older messages; mobile dynamic-height/safe-area rules added. Required-hours pages expose missing configuration; active-only propagation has a preview and audit reason. Focused tests, lint, and build passed. Actual production 400-hour assignment cause remains **unconfirmed**; no private production rows were read or changed. New required-hours migration is unapplied.
- Photo evidence: foundation is **in progress**, not a working released feature. Draft SQL has Optional/Required modes, optional captions, per-log policy snapshots, audit records, private storage, and owner mutation locks. Kept at `database/drafts/20261014010000_v26_photo_evidence.sql`, outside deployable migrations, because database validation and several security/history requirements remain unfinished.
- Added `lib/photo-evidence-image.ts` with full decoder validation, MIME/signature agreement, dimensions/size bounds, rejection of animation, and metadata-free immutable WebP output. Declared the already-installed Sharp version as a direct dependency. Two behavioral tests passed for JPEG/PNG/WebP, metadata removal, spoofing, truncation, undersized images, and oversized payloads. The validator is not yet connected to an upload endpoint.

### Remaining photo-evidence release requirements (earlier checkpoint; superseded below)

- Trusted server upload/registration path: a student must not be able to bypass byte validation by directly calling the registration RPC with fabricated dimensions/MIME. The draft RPC is not release safe until this is addressed.
- HTE policy effective dates/terms and currently authorized representative periods, concurrent policy-save protection, and previous/new audit values.
- Immutable version-to-attachment membership and review decisions, including needs-revision/resubmission and concurrent review/submit operations.
- Student upload/progress/preview/replace/remove UI, per-day attendance status and missing coverage, exception requests, HTE policy/review UI, coordinator monitoring, and notification integration.
- Isolated Supabase execution tests for migration syntax, cross-student/HTE/coordinator access, Storage URL isolation, draft/submitted locks, required/optional policies, exception transitions, and historical preservation. Neither PostgreSQL nor Docker is available on this host; no test database credentials are supplied.

### Release boundaries

No production migration, email template, account, attendance row, stored DTR, or deployment was changed. Local source implementation is not equivalent to end-to-end verification. Phase checklist items above remain open until their complete verification gate is met.

### Additional regression findings, 2026-10-14

- Corrected v26 propagation to exclude section-specific rules when applying the all-sections rule. Added assignment row locks before capturing audit before-values. This is reviewed source, not an executed database test.
- DTR now leaves next-day departures out of the prior day's departure cells and calculates undertime only for complete verified same-day sessions with configured daily hours. Existing attendance detail retains the original events. Behavioral tests cover overnight, unverified, configured, and unconfigured cases.
- The first release-check attempt passed lint/build but failed an older v22 source assertion expecting `Submit registration?`. Updated that assertion to the explicitly requested `Review your registration`; all original validation assertions remain.
- Dependency installation reported 15 audit findings (3 moderate, 12 high). No broad dependency upgrade or automatic audit fix was applied. Node on this host is 24.19.0; the application deployment target remains Node 22.

### Earlier verification results

- `npm run lint`: passed during the release gate; targeted lint repeated successfully for subsequent image/DTR/test changes.
- `npm run build`: passed.
- `node --experimental-strip-types --test tests/*.test.mjs`: **174 passed, 0 failed**, after correcting the obsolete registration-title assertion.
- `npm run build:vercel`: passed with existing bundle/configuration warnings.
- `git diff --check`: passed (line-ending advisory only).
- Re-rendered and inspected the single Form 48 after the year-prefix correction. No duplicate form or instructions page; signature lines blank. No production PDF was generated or replaced.
- SQL execution/RLS/Storage tests, real invitation delivery/password setup, authenticated role smoke tests, and requested viewport/device matrix: **not verified**. These are release gates, not covered by the passing unit/source tests.

## Current continuation checkpoint — 2026-10-14

This section supersedes the earlier draft-photo and SQL-unavailable notes. Phase completion still requires live integration checks; local test success is not a production-readiness claim.

| Pages | Current status | Implemented and verified evidence | Remaining gate |
|---|---|---|---|
| 2–9 | In progress | Centered recovery shell; browser verified invalid-link title, request-new-link and return-to-sign-in actions. Sign-in has no horizontal overflow at 375, 430, 768, 1024, 1366 and 1440px. | Valid recovery session and mobile keyboard with dedicated test user. |
| 10–11 | Blocked on test account/mail access | Explicit invitation acceptance and token-session validation have focused tests; existing admin password recovery reused, no duplicate account pathway added. | Actual email delivery, preview-safe landing, password setup and Placement Head login. Brevo preconsumption remains an unconfirmed hypothesis. |
| 12–32 | In progress | Registration summary and truthful success state implemented; browser direct-navigation check shows no false submission claim. | Authenticated confirmation/approval journey, modal keyboard and full width/theme matrix. |
| 33–35 | In progress | One original narrow form visually rendered/inspected; blank signatures, printed year and overnight/undertime mappings tested. Existing viewer and finalized files preserved. | Physical print and full live authorized viewer/version workflow. |
| 36–45 | In progress | Bounded assistant/composer and respectful scrolling implemented; build/tests pass at earlier gate. | Authenticated role/state and mobile keyboard matrix. |
| 47–54 | In progress | Actual migration executed in isolated PostgreSQL fixtures: section precedence, active-only explicit propagation, preview and audit verified; completed snapshots unchanged. | Real affected assignment term/snapshot cause remains unknown; linked staging and page cache parity. |
| 55–71 | In progress | Server upload, private bucket policies, scoped author/reviewer UI, exceptions, immutable submission membership and review history implemented. Actual migration replay and role-denial tests pass in isolated fixtures. | Linked Supabase HTTP/Storage and authenticated UI checks; photo-specific notifications; scheduled effective policy dates/terms if required beyond immediate effectiveness. |
| 72 | In progress | Typecheck passes; unified release command rerunning against latest edits. | Linked migration parity, dedicated role smoke tests and deployment approval. |

### Photo implementation changes

- Added `app/api/weekly-log-photo-evidence/route.ts`: verified caller, owner/log lookup, content decoder validation, private immutable server upload and service-only registration. Ambiguous registration failures preserve possibly registered objects; only confirmed unregistered uploads are removed.
- Added `app/services/photo-evidence.ts` and `app/components/WeeklyLogPhotoEvidence.tsx`: attendance-backed dates and truthful status, upload/replace/remove, optional captions, private preview refresh, reasoned exceptions, HTE review, coordinator read-only audit history and organization policy configuration. Integrated into existing Weekly Log authoring/detail surfaces and scoped CSS.
- Promoted the reviewed draft to `supabase/migrations/20261014010000_v26_photo_evidence.sql`. No production application. Authenticated users cannot directly upload or call the trusted registration RPC. Parent-log locks serialize changes; submitted membership snapshots retain historical attachment versions. Existing logs default to Optional and do not inherit later requirements.
- Organization policy is immediately effective for future assignments; active-assignment propagation is explicit and affects future logs only. No future-dated scheduler exists. EXIF/GPS is stripped and never used as verification. Images are normalized to immutable WebP; previous uploaded evidence is retained on replacement.
- Added PGlite dev-only dependency and `tests/v26-photo-database.mjs`. This executes real SQL against isolated contract fixtures, including RLS and Storage policy expressions, rather than only matching source strings. It is not a Supabase HTTP/Storage end-to-end test or a copy of the linked schema.
- Test coverage includes migration replay, cross-owner/HTE isolation, server-only registration, submitted locks, optional submission without photos, required missing-day rejection, pending exceptions, HTE-only approval, immutable versions, attendance preservation and required-hour scope/audit. New coordinator history-read assertion added in this continuation.
- Existing User Management password-reset mechanism already provides recovery without creating another account; end-to-end pending-user behavior remains to be checked with a dedicated account.

### Release actions and boundaries

See `docs/v26-release-checklist.md` for staging, server-only environment, native-image build, template rollout ordering and exact live tests. No account, production attendance, live template, linked migration or deployment was changed. All v26 changes remain local and uncommitted. Do not report all v26 requirements complete until the remaining gates above pass.

### Final continuation regression checks

- `npx tsc --noEmit --pretty false`: passed after the history UI/service changes.
- `npm run test:photo-database`: passed after adding coordinator audit-read coverage and a non-UTC session regression. New photo `timestamptz` values now use `now()` directly; converting to timezone-less UTC before insertion would shift the instant in a Manila database session. No existing production timestamps were changed.
- `git diff --check`: passed, with only the existing line-ending advisory on `app/layout.tsx`.
- Temporary browser viewport override reset after the responsive checks.
- Latest unified release log (`tmp/v26-release-latest.log`) records successful lint, application build, **174 tests passed / 0 failed**, both isolated database test groups, and completion of the Vercel-target build. Build configuration/bundle warnings remain; no deployment was performed.
- User selected an existing staging project and test accounts. Repository environment and CLI link both point to `aapwnawkgyoynxdhinhb`; no separate staging configuration was found. Require positive identification of the nonproduction project before any remote migration or test write.

## Staging foundation — 2026-10-15

- User confirmed `aapwnawkgyoynxdhinhb` contains live users. It remains the production link; `.env.local` was not edited.
- User created **PRAXIZ-STAGING**, reference `plvovuhtjjahiqelnvxv`, in the Free organization. Verified ACTIVE_HEALTHY and initially zero public tables.
- Exported only `public`/`private` schema via PostgreSQL 17.11 portable `pg_dump` and the CLI's temporary connection/role. No table records exported. Portable tools live in ignored `tmp/`; no PostgreSQL service was installed. The first export lacked the CLI's `--role postgres` and failed; the corrected schema-only export succeeded.
- Imported schema transactionally into staging, omitting platform default privileges and psql-only commands. Preserved table/function ACLs and table RLS. Applied both v26 migrations transactionally, successfully, **only to staging**.
- Copied only role/permission definitions (5 active roles, 20 permissions) and restored the inspected profile-sync auth trigger. No production profiles, account assignments, photos, attendance or logs were copied.
- Staging checks: zero profiles and attendance; zero public tables without RLS; photo bucket private; authenticated role cannot execute server-only photo registration RPC.
- Added auditable schema/reference preparation scripts and `scripts/start-v26-staging.ps1`. The staging launcher obtains existing staging keys into process environment only and uses port 3001; it does not change production env files or CLI link.
- Recipient for the staging-only invitation test supplied by user. No invitation has been sent yet. Next gate: explicitly authorized synthetic privileged account bootstrap, staging mail/template settings, real invitation/password flow and authenticated module tests. These are not yet verified.
- Staging role-definition/profile-trigger checks passed: 5 active roles, 20 permissions, 1 auth profile-sync trigger, zero profiles. The default Cloudflare dev runner reported loading `.env.local`; before any account creation it was stopped and replaced with the Node/Vercel runner in the staging launcher. Runtime routing still requires verification; no signed-in test or invitation has occurred.

### Authorized staging auth fixture and mail blocker — 2026-10-15

- User explicitly authorized a synthetic staging administrator and the Placement Head invitation to their supplied mailbox.
- Created one synthetic `example.invalid` Auth fixture in staging, then activated only that fixture and assigned its staging System Administrator role. Verified `private.is_system_administrator` returns true. Its test password is generated locally, kept in ignored `tmp/v26-staging-admin.json`, and never printed or committed. This is test-only bootstrap, not production signup behavior.
- Behavioral routing check passed: the local `/api/accounts/provision` endpoint accepted the staging-only bearer session and returned the expected validation response for an empty request. This supersedes the earlier unverified local-runtime routing note.
- Added guarded `scripts/v26-staging-auth.mjs`, with separate bootstrap/invite modes and duplicate-recipient protection. No invitation was sent.
- Staging dashboard explicitly disables custom invitation-template editing until custom SMTP is configured (or Pro is purchased / Send Email hook configured). Default template still uses `ConfirmationURL`; sending it would not test the requested GET-safe TokenHash flow. Stopped before sending or changing subscription. User must configure staging SMTP securely; no production SMTP credentials were read or copied.

### Staging invitation attempt — 2026-10-15

- User configured custom SMTP. Saved the staging-only GET-safe TokenHash invitation template, Site URL `http://localhost:3001`, and exact acceptance/reset-password redirect URLs. Production configuration unchanged.
- Isolated staging Vite dependency cache and React deduplication resolve the local acceptance-page invalid-hook failure; acceptance route returned HTTP 200.
- Actual application provisioning endpoint accepted the staging-only administrator session. One authorized invitation attempt then returned HTTP 500, `Error sending invite email`.
- Inspected staging Auth logs: upstream SMTP rejected authentication with **535 / 5.7.8 Authentication failed**. This is a mail credential/configuration blocker, not successful delivery. No repeat attempt or account deletion performed. Check for a partial recipient account before any retry.
- Next action requires the user to correct staging SMTP credentials privately. Delivery, recipient password setup, and Placement Head sign-in remain unverified.
- After the user's next READY, the duplicate-recipient check passed and one retry was made. Staging Auth log at 01:12:43 again confirms SMTP `535 / 5.7.8 Authentication failed`; delivery remains blocked. No production change or repeated automatic retry. User must verify both SMTP credential fields and save them in staging.
- Following explicit confirmation that credentials were saved, one further guarded retry failed. Logs show configuration reload at 01:21:27 followed by `/invite` SMTP 535 at 01:22:15. Thus the saved configuration was reloaded, but SMTP authentication remains rejected; do not assume the user failed to save. No further automatic retries.

### Placement Head staging invitation completed — 2026-10-15

- Created a fresh Brevo SMTP key after confirming the previously listed key was the older August 30 credential. The user privately copied it into PRAXIZ-STAGING; Supabase displayed **Successfully updated settings**. Port remains 587. No SMTP secret was printed, stored in the repository, or copied into production.
- SMTP authentication then passed. The live staging flow exposed three independent database compatibility defects: `placement_head` was omitted from the authorized privileged-role allowlist; the coordinator-only program approval guard ran before its role check; and Placement Head activation used the legacy notification insert without the now-required deduplication key.
- Added `20261015000000_v26_placement_head_invitation.sql` to fix all three without opening public privileged signup. Placement Head applications still require an unexpired, server-created authorization, and the activation notification now uses `private.emit_notification` with an idempotent key.
- Added the migration to the staging preparation script and added regression assertions. Targeted auth-registration tests pass (6/6), TypeScript passed, and `git diff --check` passed apart from the existing `app/layout.tsx` line-ending advisory.
- Applied only the targeted migration to PRAXIZ-STAGING. The final guarded application request reported that the invitation was sent.
- Read-only staging verification: profile `active`; exactly one active `placement_head` role assignment; registration `approved`; authorization both consumed and completed. Production configuration and data remain unchanged.
- Brevo transactional logs independently confirm four messages to `lilithtria25@gmail.com` were accepted and marked **Delivered** at 08:19, 08:22, 08:24, and 08:25 on 2026-10-15. The newest message has subject `You've been invited`, sender `praxiz.official@12000560.brevosend.com`, reply-to `praxiz.official@gmail.com`, and contains the expected staging acceptance link. No bounce or block is recorded. The recipient reports that the messages are not visible in their inbox, so Gmail Spam/Promotions/All Mail filtering remains the immediate external delivery check.
- The delivered invitation reached `/reset-password?flow=invitation` but exposed a React hydration mismatch: the server initialized recovery copy while the browser initializer read the invitation query string. `ResetPasswordPage` now renders a deterministic neutral checking state, resolves the flow after hydration, and validates only the resolved flow. Focused auth tests pass (7/7), TypeScript passes, and a fresh browser load renders and settles without the Next.js error overlay. Password creation itself remains user-only and unverified.
- The one-time invitation was consumed before the hydration error interrupted password creation, and neither remaining browser tab retained a valid invitation password session. Reopening the stripped `/accept-invitation` URL correctly reports the token as already accepted/invalid. The staging account and approved Placement Head role remain intact; the non-destructive recovery path is a password-recovery email for that existing account, pending explicit send confirmation.
- After explicit user confirmation, PRAXIZ sent exactly one password-recovery message to the existing staging account. The application displayed its generic success state, and Brevo independently recorded `Reset your password` as both **Sent** and **Delivered** to `lilithtria25@gmail.com` at 08:49 on 2026-10-15. No duplicate account or database mutation was used. Password selection/submission and the resulting Placement Head login remain user-only end-to-end gates.
- That recovery token was already expired when the recipient opened it, while Brevo recorded prior automated opens/clicks. Root cause: the staging Reset password template still used Supabase's single-use `ConfirmationURL`, which can be consumed by tracked-link scanners before the user reaches PRAXIZ. Added a GET-safe `/recover-password` landing, explicit `acceptPasswordRecovery` verification, a deterministic recovery-session handoff, the `docs/supabase-recovery-template-v26.html` artifact, and route/source regressions. Focused auth tests pass (8/8), TypeScript and `git diff --check` pass, and a local fake-token GET renders the explicit Continue page without verification. Saved the new template only in PRAXIZ-STAGING; Supabase confirmed **Successfully updated email template**, and its preview resolves to `/recover-password?token_hash={{ .TokenHash }}&type=recovery`. A new end-to-end email is pending explicit send confirmation.
- The first post-save recovery message was still rendered from Supabase's cached old template. To make propagation observable, the staging subject was changed to `Reset your PRAXIZ password`, saved again, reloaded, and confirmed persisted. After explicit confirmation, one final message was sent; Brevo recorded the distinctive subject as both **Sent** and **Delivered** to `lilithtria25@gmail.com` at 09:02 on 2026-10-15 with no bounce. The message link itself has not been clicked by Codex, so its one-time token remains reserved for the recipient.
- The recipient later opened that distinctive message and reached `/recover-password`, confirming the new template and GET-safe route are active. The attempt shown at 13:28 occurred more than four hours after the 09:02 delivery and failed only when the explicit Continue action verified the now-expired token. This is expected one-time-token expiry, not the prior hydration/scanner defect; no global automatic recovery verification path was found.
- Remaining end-to-end gate: send one fresh recovery message, have the recipient use it promptly while the local staging server is running, press the explicit Continue button, set their password themselves, and verify Placement Head sign-in/workspace access. All earlier invitation and recovery links are invalid and must not be used.
- After the user's renewed action-time confirmation, exactly one fresh staging recovery request was submitted at 13:32 on 2026-10-15. The local application displayed **Open your email inbox**, the PRAXIZ-STAGING Auth log recorded `/recover | request completed` at 13:32:49, and Brevo independently recorded the distinctive `Reset your PRAXIZ password` message as **Sent** and **Delivered** to `lilithtria25@gmail.com` at 13:32 with zero bounces. Codex did not open the message or its one-time link; the token is reserved for the recipient. Password entry/submission and the resulting Placement Head sign-in remain user-only gates.
- The recipient used that fresh link and submitted a new password. Staging Auth logs prove the change succeeded: `/verify` completed at 13:36:24, followed by a status-200 `PUT /user` whose event is `user_modified` at 13:36:40, then `/logout` at 13:36:41. The subsequent “password link cannot be used” page was therefore a false post-success state: signing out changed the Auth context callback identity, retriggering password-session validation after the session had intentionally been cleared. `ResetPasswordPage` now latches successful completion, ignores stale validation failures after the password update, and gives the success branch precedence over checking/invalid branches. Focused authentication tests pass (9/9), TypeScript passes, and `git diff --check` passes. No further reset is required; Placement Head sign-in with the newly chosen password is the remaining user-only verification gate.

## Production release — 2026-10-15

- The user confirmed that the staging Placement Head account and password flow work end to end.
- Final release gate passed: lint, application build, **178 tests passed / 0 failed**, isolated photo/required-hours database checks, Vercel-target Linux build, TypeScript, and `git diff --check` (existing `app/layout.tsx` line-ending advisory only).
- Created and validated `tmp/v26-production-predeploy-20261015.dump` before any production database change. The ignored archive contains the `public`, `private`, and `storage` schemas and is readable by `pg_restore --list`.
- Applied only the reviewed additive migrations `20261014000000`, `20261014010000`, and `20261015000000` to production. Local and remote migration history now match through `20261015000000`. Post-apply lint has no new errors; the same three pre-existing legacy warnings remain.
- Production deployment `dpl_VaCSg5YS2jrkvKBYqNtt6L5euX6o` reached `READY` and is aliased to `https://praxiz.vercel.app`. Public auth routes `/`, `/signin`, `/forgot-password`, `/recover-password`, and `/accept-invitation` returned HTTP 200. Invalid/unauthenticated API checks returned the expected 405 and 401 responses.
- Production Auth Site URL is already `https://praxiz.vercel.app`; the existing `https://praxiz.vercel.app/**` redirect allowlist covers the explicit invitation and recovery routes. No URL configuration change was needed.
- After explicit action-time confirmation, the production Invite user and Reset password templates were saved from the reviewed v26 artifacts. Both were reloaded from Supabase and verified persisted: invitation uses `/accept-invitation?token_hash={{ .TokenHash }}&type=invite`, recovery uses `/recover-password?token_hash={{ .TokenHash }}&type=recovery`, and neither action depends on the scanner-consumable `ConfirmationURL` flow.
- Release commits: `0b4c27f`, `dfdcaf3`, and `276e3f2`. The root-scoped `.vercelignore` prevents local backups, temporary files, tests, docs, and migrations from entering deployment packages without excluding runtime modules such as `lib/supabase`.

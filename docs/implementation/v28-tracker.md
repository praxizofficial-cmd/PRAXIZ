# PRAXIZ v28 implementation tracker

Last updated: 2026-10-16 (Asia/Manila)

## Evidence baseline

- Read the complete supplied v28 master prompt and inspected all 13 pages of `v28.pdf` at original render detail.
- Reused the 275-page v27 audit and its institutional-form review as the regression baseline; `v27 (1).pdf` is byte-identical to the previously audited v27 PDF.
- Inspected the current repository and linked migration history before editing. The CLI is linked to the dedicated staging project, not production.
- Preserved immutable attendance events, attendance review history, finalized DTR snapshots, document versions, evaluation results, authentication, role boundaries, and existing RLS policies.

## Page-by-page disposition

| v28 page | Observed surface | Finding | Resolution / evidence |
| ---: | --- | --- | --- |
| 1 | Coordinator Partner HTEs; Attendance Monitoring | Partner HTE list failed as a whole when one of three direct table reads was denied by RLS. Attendance/DTR calculations needed one canonical duration source. | Added the server-authorized `list_partner_htes_v28` RPC and replaced the fragile chained reads. Added canonical attendance-progress view and shared timestamp-pair calculation. |
| 2 | Coordinator Weekly Logs; Admin HTE Work Configurations | Weekly Log controls are present. Admin work configuration depended on the same failing Partner HTE loader. | Preserved Weekly Log workflow; repaired shared Partner HTE loading used by the admin configuration selector. |
| 3 | Admin Registrations; HTE Verification | Registration flow is present. HTE verification displayed the Partner HTE permission error and no organizations. | Preserved registration logic; repaired the shared Partner HTE directory path without widening anonymous or inactive-user access. |
| 4 | Admin HTE Work Configurations | Current-state/configuration editor UI exists, but HTE directory failure blocked accurate selection/state. | Shared RPC repair applied; existing correction reason, optional propagation, and immutable history remain unchanged. |
| 5 | Required File Distribution; Support Inbox | Controlled file library and support list exist. | No file-library replacement. Support read state and case state remain independent. |
| 6 | Coordinator Analytics | Verified metrics stayed visible, but AI requests lacked a bounded client timeout. | Added a 45-second timeout, typed timeout message, and retryable state while preserving verified metrics. |
| 7 | Form 48 DTR | Displayed durations/undertime were inaccurate. A daily-hour target was incorrectly usable as an undertime schedule. | Earliest immutable Time In + latest immutable Time Out are selected deterministically; elapsed seconds are rounded once. Form 48 undertime stays blank until a separately authorized work schedule exists. Existing finalized snapshots remain frozen. |
| 8 | Student Attendance; Documents | Student attendance rows showed durations inconsistent with visible timestamps. Document workflow was otherwise intact. | Student history now derives verified duration from the same authoritative pair. Documents were not rebuilt or modified. |
| 9 | Support details; Placement Dashboard | Support modal used the message subject as its heading and forced oversized message panels. Placement dashboard filters/metrics were present. | Modal heading is now exactly **Support message details**; subject and message are preserved separately; message panels size to content. Placement dashboard retained. |
| 10 | Placement Students; Document Compliance | Required scoped tables, filters, status labels, and detail actions were present. | Retained existing v27 implementation; regression-covered. No authorization scope was widened. |
| 11 | Placement Required File Formats; AI Analytics | Controlled format workflow and verified record summary were present. | Retained controlled publishing/version workflow. AI summary remains independent of optional AI generation. |
| 12 | Placement AI failure; HTE Work Setup | Placement AI failure replaced/hid all verified metrics because record-load and AI errors shared one state. | Split `loadError` from `aiError`, added timeout/retry, and kept verified metrics visible during AI failure. HTE setup retained. |
| 13 | HTE Work Setup editor; Attendance Verification | Work setup editor and attendance review existed; both must use consistent values without rewriting coordinator-owned hours. | Preserved HTE daily-hours ownership and opt-in propagation. Attendance review and all progress consumers now share canonical calculations. |

## Database changes

### `20261017000000_v28_attendance_accuracy.sql`

- Calculates a complete original pair from the earliest immutable Time In and latest immutable Time Out; uses an approved correction only when the original pair is unusable.
- Rounds elapsed seconds once to whole minutes and rejects incomplete, non-chronological, or longer-than-24-hour pairs.
- Adds the security-invoker `assignment_attendance_progress_v28` view and merges overlapping verified intervals so retries/duplicate sessions cannot double-credit time.
- Regenerated/new DTR snapshots use the canonical duration. No historical attendance event, verification, or finalized snapshot is updated or deleted.

### `20261017010000_v28_partner_hte_scope.sql`

- Adds a minimal server-authorized Partner HTE directory for active System Administrators and Internship Coordinators.
- Keeps Coordinator intern counts restricted to assignments they actively supervise; anonymous and inactive users receive no access.
- Returns only fields needed by the Partner HTE, HTE Verification, and HTE Work Configuration screens.

Both migrations were dry-run and applied to the dedicated staging project. Production is unchanged until the final release gate passes.

## Verification status

- TypeScript: passed after the v28 changes.
- Focused v28 regression suite: **29/29 passed**.
- Staging migration history: aligned through `20261017010000`.
- Local public sign-in browser check: rendered correctly at `http://localhost:3002/signin`.
- Authenticated role-by-role staging UI checks: require an authenticated staging browser session; no password was requested, entered, or stored by Codex.
- Full release gate: passed — ESLint, production build, **212/212** application tests, all photo/document/support database replay suites, and the Vercel-target build.
- Production migration dry run listed exactly `20261017000000` and `20261017010000`, with no seeds or role changes.
- Those two reviewed migrations were applied successfully to production; local, production, and staging histories now align through `20261017010000`. The CLI was relinked to staging afterward.

## Remaining safe gates

1. Commit/push the application changes and verify the connected Vercel deployment and public routes.
2. Perform authenticated, non-mutating production smoke checks when a user session is available; do not create, rewrite, or fabricate real workflow records merely for testing.

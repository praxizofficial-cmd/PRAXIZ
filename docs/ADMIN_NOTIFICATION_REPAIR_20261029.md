# Administrator notification repair — 29 October 2026

## Findings
The live production audit found 5 approved, email-verified student applications and 13 rejected, unverified applications. There were no pending/under-review student applications and no registration.submitted notifications. Therefore the current empty admin inbox is not evidence of an RLS retrieval failure; there is no actionable historical registration to backfill.

The original schema had only applicant decision notifications. The 28 October insert trigger fixed future submission delivery but did not gate on verification, handle verification updates, deep-link to a review dialog, reconcile task status, or backfill pending applications. The UI loaded on mount/window focus/custom events, with no realtime subscription or periodic recovery.

## Applied Supabase changes
- 20261029000000_verified_registration_notifications.sql: active trusted admin recipient helper; verified pending/under-review registration eligibility; insert, review-state and auth email-verification hooks; idempotent repair of eligible historical applications; metadata includes name/campus, high priority, category, review action and exact registration URL. Review decisions change actionRequired separately from recipient read/archive state. Recipient table is added to an existing supabase_realtime publication if available.
- 20261029010000_admin_workflow_notifications.sql: actual pending HTE verification, submitted required-file version, and dead-letter outbox events. Existing events are deduplicated and action state updated when their source changes. Raw job error/payload contents are never copied into notifications.
- Both SQL editor executions returned Success. No rows returned. No production accounts or registration decisions were changed. No RLS policies were weakened. No historical alerts were fabricated. Functions are private SECURITY DEFINER with empty search_path and no public/client execute grants.
- SQL was applied through the connected Supabase SQL Editor; local migration files are retained and idempotent. No CLI migration-history repair was performed.

## Local frontend changes (not deployed)
- app/services/praxiz-services.ts: existing authenticated recipient queries support active/archive views; map optional category/priority/action/campus metadata; reuse mark_notification_read and archive_notification RPCs.
- app/PraxizApp.tsx: filtered realtime recipient subscriptions with cleanup and 30-second fallback polling, focus/login load, exact registration dialog links, unread/action/critical summaries, priority/campus/date/category filters, archive/restore and mark-unread actions. Retrieval errors suppress misleading empty states.
- app/ui-refinement.css: wrapping notification controls/actions for narrow screens.
- tests/admin-registration-notifications.test.mjs: isolated PostgreSQL-compatible regression coverage using the actual notification helper fixture.
- tests/ui-refinement.test.mjs: additional archive/query/RPC authorization failure tests.
- tests/fixtures/emit-notification.sql: existing helper fixture, not a production credential or data dump.

Existing unrelated suffix, authentication, password CSS and other working-tree edits were preserved. No Git commit/push or Vercel deployment was performed in this task.

## Category coverage
| Category | Implemented now | Remaining |
|---|---|---|
| Registration & Accounts | Verified student review event, exact link, multiple active admins, resolution, eligible backfill | Privileged provisioning failure/intervention signals |
| HTE Verification | Pending verification request; verified/rejected/deleted state ends action | Missing/conflicting organization data rules |
| Academic Terms | None added | Configured reminder timing, scheduled end-date checks, draft/activation problems; never auto-finalize |
| HTE Work Configuration | None added | Applicable configuration/conflict evaluation and scheduled reconciliation |
| Files & Templates | Submitted required-file version; published/returned state ends action | Publishing failure events and other template request types |
| Security & Access | None added | Established backend threat thresholds/signals; no ordinary-login alerts |
| Operations | Outbox dead-letter after configured retry exhaustion | Broader DB/storage/job failure aggregation and dedicated operational detail view |
| Support & Escalations | None added | Explicit escalation and priority rules; routine feedback is not sent to administrators |

This is the core registration repair plus three existing backend event integrations, not completion of every institutional category in the requested roadmap.

## Validation and limits
- Seven targeted tests passed: unverified suppression; verification transition; multiple admins; duplicate role and event deduplication; inactive/expired/future recipients; no-admin handling; approval clears needs-action; read does not approve; reviewed backfill exclusion; workflow event/resolution behavior; private helper execute denial; recipient-only RLS isolation; pagination/auth/retrieval failures; archive/read mutations.
- TypeScript no-emit passed. Full ESLint passed; targeted ESLint passed after interface changes.
- Final npm run build passed after the date-filter addition. Vinext reports its existing static route-classification limitation; there were no build errors.
- No real student signup, mailbox verification, CAPTCHA, realtime WebSocket delivery, or signed-in browser review/archive persistence test was performed. No fake production accounts/alerts were created. These must be verified on a safe test account/environment after frontend deployment.
- A production recipient publication is used when available; polling recovers missed realtime events.
- Current inbox can correctly remain empty until a new eligible event occurs. Approved/rejected historical applications are not regenerated as pending alerts.


## Deployment — 29 October 2026
Notification frontend deployed to https://praxiz.vercel.app. Vercel deployment dpl_GGeshxEvAjDYA5e5k2d1hJrYxUtR is READY. Release copied from the previous production snapshot with only app/PraxizApp.tsx, app/services/praxiz-services.ts and app/ui-refinement.css updated. Seven targeted tests passed again. No Git push or additional database mutation performed during deployment. Signed-in notification delivery remains to be verified with a real eligible event.

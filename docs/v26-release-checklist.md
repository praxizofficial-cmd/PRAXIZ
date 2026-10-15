# v26 release checklist

These steps remain the audit checklist. The production application, reviewed additive migrations, and scanner-safe production invitation/recovery templates were deployed on 2026-10-15 after the gates below passed.

## Production release record — 2026-10-15

- `npm run release:check`: passed; 178 tests passed and none failed.
- `npx tsc --noEmit --pretty false`: passed.
- Production predeploy archive: `tmp/v26-production-predeploy-20261015.dump`, validated with `pg_restore --list`.
- Applied production migrations: `20261014000000`, `20261014010000`, `20261015000000` only; migration parity confirmed afterward.
- Production database lint: no new errors; three unchanged legacy warnings remain.
- Vercel production deployment: `dpl_VaCSg5YS2jrkvKBYqNtt6L5euX6o`, `READY`, aliased to `https://praxiz.vercel.app`.
- Live route smoke: `/`, `/signin`, `/forgot-password`, `/recover-password`, `/accept-invitation` returned 200. Guard checks returned 405 for GET photo evidence and 401 for unauthenticated account provisioning.
- Production Site URL and wildcard redirect allowlist already match `https://praxiz.vercel.app`; no change was made.
- Production Invite user and Reset password templates were saved after explicit confirmation, reloaded, and verified to persist the respective `/accept-invitation` and `/recover-password` TokenHash landing URLs.

## Staging first

1. Compare the linked database migration history and actual schema with the repository. Review the two additive migrations `20261014000000_v26_required_hours.sql` and `20261014010000_v26_photo_evidence.sql`. Take the normal recoverable database backup before authorized application. Do not reset, reseed, or run a blind production push.
2. Apply them in timestamp order to a nonproduction Supabase project with the existing schema. The isolated PGlite tests use contract fixtures, not a clone of the linked database, so they cannot establish migration parity with production.
3. Configure server-only `SUPABASE_SERVICE_ROLE_KEY` alongside the existing Supabase URL and public key. Never prefix the service key with `NEXT_PUBLIC_`. The upload route validates the caller and file before using this key. Authenticated clients have no direct bucket upload or registration-RPC privilege.
4. Build from source on the Vercel Linux/Node 22 target; do not ship a Windows prebuilt Sharp native module. Run `npm run release:check` and `npx tsc --noEmit`.
5. With dedicated test users, exercise student draft/upload/replace/remove/submit, required-day exception pending/approved/rejected, HTE review, coordinator read-only history, and cross-student/HTE/campus denial. Test actual signed URL generation and expiration through Supabase Storage, not only database policy expressions. Verify oversized/malformed requests, failed upload cleanup, and mobile camera uploads.
6. Compare unchanged authoritative attendance, DTR versions, narrative log review, notifications, documents, and evaluations before/after. Explicitly test weekly-log return/resubmission with retained evidence history.

## Invitation rollout order

1. Deploy and verify `/accept-invitation` before changing any live mail template. An initial GET must not call `verifyOtp`; acceptance must require the button. Confirm token-bearing URLs are excluded from analytics and request logging in hosting/mail systems.
2. In Supabase Authentication email templates, replace **Invite user** content with `docs/supabase-invite-template-v26.html`. Set the actual production Site URL and allowlisted callback URLs. Do not use a preview deployment origin for production email.
3. Deploy and verify `/recover-password`, then replace the **Reset password** template with `docs/supabase-recovery-template-v26.html`. Both landing pages must remain GET-safe: mail previews and scanners may open them, but token verification must require the user to press the explicit button.
4. Review Brevo click tracking and preview behavior. Staging confirmed that tracked recovery links can be opened before the recipient reaches the password form; the TokenHash landing prevents those GET requests from consuming the token.
5. For an existing pending account, reuse the existing User Management → Manage access → password reset action, or the public recovery form. Do not recreate/delete the Auth user, profile, registration, or role assignment. Confirm recovery of that dedicated pending account does not activate an unapproved role.
6. Test a dedicated Placement Head account: delivered message → preview-safe GET → explicit acceptance → verified session → password update → sign-out → normal email/password sign-in → correct trusted scope. Also test used/expired/invalid links and recovery. Do not use real student accounts for these tests.

## Data and policy boundaries

- Required-hour configuration does not change active assignments unless explicitly checked, previewed, and saved with a reason. More specific section configuration wins. Completed/unrelated assignments must remain unchanged.
- Photo policy takes effect immediately for future assignments; propagation to future logs of current active assignments is explicit. Existing logs retain their frozen policy. Future-dated/term-scheduled policy activation is not implemented.
- Photo decisions affect evidence only; they never create attendance or hours. No new photo-specific notification dispatch is implemented; existing weekly-log notifications remain the notification path and still need staging regression checks.
- Existing finalized DTR artifacts are not replaced. Confirm preview/download/physical print of newly generated one-form reports in staging.

## Release stop conditions

Stop on any linked-schema mismatch, RLS/Storage isolation failure, invitation failure, or change to historical attendance/assignments. Keep the prior application deployment available. Do not roll back by dropping evidence tables containing user data. Production migration/template activation requires explicit approval and a tested recovery plan.

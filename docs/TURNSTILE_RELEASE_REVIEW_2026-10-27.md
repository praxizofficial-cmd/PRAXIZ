# Turnstile release review — 27 October 2026

Production has NOT been deployed or pushed during this review. Supabase CAPTCHA enforcement and all database settings/data have NOT been changed.

## Preview

- URL: https://praxiz-4qb3cm0ea-praxiz.vercel.app
- Inspector: https://vercel.com/praxiz/praxiz/5GnrKZmV4H2dDqdnqomdwBbM5PFC
- Deployment: dpl_5GnrKZmV4H2dDqdnqomdwBbM5PFC; READY; Vercel Authentication protection retained.
- Source: ignored local tmp/preview-turnstile-20261027 snapshot containing 236 source files, including all new runtime components. No .env.local or other private environment files copied. No commit or Git push.
- Existing authorized preview-access token used for read-only requests. No new bypass token created or protection disabled.

## Changes made in this review

- app/PraxizApp.tsx: share verification logic across Login, Forgot Password, and registration review; preserve institutional email checks, consent, student-only registration and trusted role resolution.
- app/auth/supabase-auth.tsx: preserve the other editor's captchaToken integration for all three Supabase Auth methods and correct its formatting.
- app/components/useTurnstileTheme.ts: observe the effective document theme as well as appearance and system events.
- app/components/useTurnstileVerification.tsx (new): single configuration guard, flexible widgets, Light/Dark/System appearance support, token invalidation after theme changes (including round trips), expiry, timeout, errors and retries. Widget and script errors are visible. No empty Site Key fallback.
- app/ui-refinement.css: responsive widget width and full-width registration review placement.
- .env.example: document the public Site Key variable, with an empty template value and no credentials.
- tests/turnstile-auth.browser.mjs (new): intercepted browser regressions for all three auth flows and Preview missing-key handling.
- ThemeControls.tsx inspected; its existing effective System appearance handling works and required no changes.

All other pending UI, notification, evaluation, document and attendance work was preserved. The current source was compared with the previous production snapshot; runtime differences are limited to Turnstile integration and its styling, plus the existing Academic Terms CSS rule. The complete pending-file inventory is below.

## Validation

- npx tsc --noEmit: PASS.
- npm run lint: PASS (final rerun recorded in tmp/turnstile-lint.log).
- npm run build: PASS; rerun after the final runtime changes. Existing Vinext route-classification and future Vite import-extension warnings remain; no build errors.
- node --experimental-strip-types --test tests/*.test.mjs: 238 PASS, 0 failed.
- Local browser regressions: 52 PASS with a synthetic Turnstile API and all auth requests intercepted. Verified actual Supabase wire payloads contain gotrue_meta_security.captcha_token for password sign-in, recovery and student signup. No real accounts, emails or database mutations.
- Preview: Vercel build PASS, READY. Authenticated read-only GET checks returned HTTP 200 for /signin, /forgot-password and /register.
- Preview browser checks: 5 PASS. Login, recovery and registration review show the missing Site Key configuration error; no empty-key widget is rendered; registration stays blocked; no runtime/hydration errors.
- git diff --check: PASS (line-ending notices only).
- .env.local is Git-ignored, absent from tracked files and excluded from the upload. Private-key/token pattern scans found no matching credentials in the candidate files. Existing service credentials remain server-only in Vercel.

## Release blockers and environment findings

1. NEXT_PUBLIC_TURNSTILE_SITE_KEY exists in Vercel Production and matches the local Site Key (comparison performed in memory without printing either value). Cloudflare identifies this key as PRAXIZ Development; its only allowed hostname is localhost. It does not authorize praxiz.vercel.app or the Preview hostname. The account showed only one widget. A matching local value is therefore NOT confirmation of correct production configuration.
2. Vercel Preview has no NEXT_PUBLIC_TURNSTILE_SITE_KEY. This Preview deliberately uses the existing configuration unchanged, allowing verification of the explicit missing-key failure. It is not a release candidate for real authentication until the variable and hostname are configured.
3. Configure an appropriate production widget for praxiz.vercel.app and a preview widget/explicit allowed hostname for praxiz-4qb3cm0ea-praxiz.vercel.app (future deployment URLs may differ). Do not broadly authorize vercel.app. Cloudflare's hostname rules do not let the production alias automatically authorize sibling Preview hostnames.
4. Set the matching public Site Keys in the respective Vercel Production and Preview build environments. NEXT_PUBLIC values are compiled into the client, so rebuild after any change. Production NEXT_PUBLIC_SITE_URL already exists. Keep the preview origin isolated; check Supabase's redirect allowlist for preview sign-in/recover-password URLs before a real email-flow test.
5. The Supabase CAPTCHA Secret Key pairing and current enforcement state were NOT verified. The public Auth settings endpoint does not disclose them. The browser configuration check was stopped by Computer Use because it could not reliably identify the current browser URL. No secret was revealed, rotated, copied or changed. The owner must verify that Supabase's stored CAPTCHA secret belongs to the selected production widget; keep enforcement OFF during this release.
6. The Supabase CLI is linked to an inactive staging project; no linked-project configuration or database commands were run. Local public Auth requests target the active PRAXIZ production project, so all browser mutation requests were intercepted.

## Proposed release steps, after owner review

1. Configure/confirm the production and Preview widget hostnames and public Site Keys. Confirm the matching Supabase secret privately; leave CAPTCHA enforcement OFF.
2. Rebuild a Preview with the correct Site Key, then test actual widget rendering and valid token delivery, Light/Dark/System modes, phone widths and authorized test-account recovery/registration. Current synthetic tests do not prove real Cloudflare issuance or Supabase secret pairing.
3. Recheck the candidate manifest against any new concurrent edits. Review/stage only approved source, test and documentation files; exclude private env files, generated output and unrelated work. Include both new Turnstile hook files.
4. Show the final diff, validation and environment results to the owner and obtain production approval, as requested. Only then create the production build/deployment using Production environment variables. Do not promote the current missing-key Preview.
5. Verify production sends valid tokens before separately deciding whether to activate Supabase enforcement. Enabling enforcement is explicitly outside this deployment.

## Changes after the Preview snapshot

- tests/turnstile-auth.browser.mjs

Only the browser test runner was extended after upload; deployed runtime source is unchanged.

## Complete pending-file inventory before this report

```text
 M .env.example
 M app/PraxizApp.tsx
 M app/auth/supabase-auth.tsx
 M app/components/Dialog.tsx
 M app/components/EvaluationWorkspace.tsx
 M app/components/MonthlyDtrWorkspace.tsx
 M app/components/PlacementWorkspace.tsx
 M app/components/WeeklyLogPhotoEvidence.tsx
 M app/data.ts
 M app/globals.css
 M app/layout.tsx
 M app/services/praxiz-services.ts
 M package-lock.json
 M package.json
 M tests/registration-success-layout.test.mjs
 M tests/student-feedback-delivery.test.mjs
 M tests/v20-authoritative-fix.test.mjs
 M tests/v22-authoritative-repair.test.mjs
 M tests/v23-emergency-stabilization.test.mjs
 M tests/v27-hte-work-setup.test.mjs
 M tests/v27-shared-shell.test.mjs
 M tests/v9-workflows.test.mjs
?? app/components/FloatingDashboard.tsx
?? app/components/PublicAnalytics.tsx
?? app/components/PublicInteractiveFlow.tsx
?? app/components/PublicReveal.tsx
?? app/components/PublicWorkspaceExplorer.tsx
?? app/components/RegistrationJourney.tsx
?? app/components/RegistrationNavigator.tsx
?? app/components/SdgExplorer.tsx
?? app/components/WorkspaceMetrics.tsx
?? app/components/usePublicContentTransition.ts
?? app/components/usePublicPreview.ts
?? app/components/useTurnstileTheme.ts
?? app/components/useTurnstileVerification.tsx
?? app/landing-refresh.css
?? app/ui-refinement.css
?? app/workspace-refresh.css
?? docs/DEPLOYMENT_2026-10-26.md
?? docs/MANUAL_UI_REFRESH_IMPLEMENTATION.md
?? docs/NOTIFICATION_DIAGNOSTICS.sql
?? docs/UI_REFINEMENT_IMPLEMENTATION.md
?? lib/notification-target.ts
?? lib/registration-name.ts
?? tests/landing-interactions.browser.mjs
?? tests/manual-ui-refresh.test.mjs
?? tests/turnstile-auth.browser.mjs
?? tests/ui-refinement.browser.mjs
?? tests/ui-refinement.test.mjs
```

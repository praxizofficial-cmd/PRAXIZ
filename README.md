# PRAXIZ

PRAXIZ is the role-based internship monitoring platform for Partido State University. This application version targets the clean Supabase schema installed through PRAXIZ database Phases 1–10.

## Requirements

- Node.js 22.13 or newer
- npm
- The new PRAXIZ Supabase project with Phases 1–10 verified
- The project's browser-safe Supabase URL and publishable key

## Connect the application

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` to the new project URL.
3. Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the new publishable key.
4. Keep `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local work; replace it with the deployed HTTPS address when publishing.
5. Never add a service-role or secret key to this browser application.

The old project configuration is intentionally not included.

## Run and verify

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

In Supabase Authentication URL Configuration, use that address as the local Site URL and allow `http://localhost:3000/**` as a redirect URL. Add the final HTTPS address before deployment.

Before release, run:

```bash
npm run release:check
```

## Prepare a Vercel deployment

PRAXIZ keeps its existing Sites/Cloudflare build in `vite.config.ts` and uses a separate Vercel build in `vite.vercel.config.ts`.

1. Import the repository into Vercel. The checked-in configuration selects Node.js 22, runs `npm ci`, builds with Vinext and Nitro, and emits Vercel Build Output API artifacts in `.vercel/output`.
2. Add these Vercel environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` for Production only, set to the canonical HTTPS domain
3. In Supabase Authentication URL Configuration, set the production Site URL to the same canonical HTTPS domain. Allow the exact production callback paths and the Vercel preview pattern `https://*-<team-or-account-slug>.vercel.app/**`.
4. Run `npm run release:check` before pushing a release. The command validates lint, the existing Sites/Cloudflare build and tests, and the Vercel/Nitro build.
5. Deploy to Vercel Preview first and test registration confirmation, sign-in, password recovery, role routing, attendance, daily logs, documents, evaluations, notifications, and private file access before promoting the deployment.

`NEXT_PUBLIC_VERCEL_URL` is used automatically when `NEXT_PUBLIC_SITE_URL` is not set, so preview email links can return to the preview deployment. Never add a Supabase service-role key to Vercel or to any `NEXT_PUBLIC_` variable.

## Database integration

- `lib/supabase/client.ts` owns the singleton browser client.
- `lib/supabase/server.ts` owns the cookie-aware server client.
- `app/auth/supabase-auth.tsx` resolves active profiles and role assignments.
- `app/services/praxiz-services.ts` contains application reads and controlled workflow calls.
- `assignment_progress` is the authoritative dashboard progress view.
- Attendance, logs, documents, evaluations, notifications, and registration reviews use database functions; the application does not write their protected workflow tables directly.

The obsolete local Supabase migrations and legacy seed are deliberately excluded. The verified new Supabase project is the database authority.

## Connected workflows

- Email/password authentication, registration, and password recovery
- Role-based workspace routing
- Institutional registration choices
- Verified progress summaries
- Server-timestamped attendance and attendance review
- Versioned daily logs and review history
- Prepared private document uploads and controlled submission/review
- Versioned evaluations and finalization
- Per-user notifications
- Administrator registration review and system totals

AI analytics remains a clearly labeled prototype until its governed service is designed separately.

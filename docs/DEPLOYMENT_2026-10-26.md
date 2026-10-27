# Production deployment — 26 October 2026

- Production: https://praxiz.vercel.app
- Deployment: https://praxiz-6pqqzealj-praxiz.vercel.app
- ID: `dpl_GCm9LikfBcLca1o7sUm6ieVZ4dmE`
- Vercel status: READY; production alias assigned successfully.
- Project/account: existing PRAXIZ project in the praxiz team.

Deployed the completed UI and notification refinements from the isolated `tmp/release-ui-20261026` snapshot. The other editor's incomplete CAPTCHA integration was excluded only in that release copy: the previous sign-in implementation was retained. Original working-tree CAPTCHA changes were not overwritten. No Supabase settings or policies were changed.

Release validation: lint and TypeScript passed, production build passed, 238 tests passed, Vercel's remote production build passed. Public landing, sign-in, registration and success routes returned HTTP 200. All 53 public UI browser checks passed against the production alias, including successful navigation responses, SDG images, registration review, responsive widths and theme combinations. The browser checks blocked record-changing requests and used explicitly mocked academic options and browser-only registration proof. No real registration was submitted.

Signed-in production workflows and live notification delivery were not exercised. No database changes, Git commit or Git push were performed. The release source remains available in the ignored local snapshot for comparison with ongoing work.

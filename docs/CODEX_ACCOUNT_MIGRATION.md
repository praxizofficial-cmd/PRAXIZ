# PRAXIZ Codex Account Migration

This guide transfers development access to another Codex account without moving
production data, copying credentials, or weakening PRAXIZ authorization.

## What is portable through GitHub

The repository contains the application source, the npm lockfile, tests,
database migration history, Vercel build configuration, and a safe
`.env.example`. A new Codex account can clone the repository and reproduce the
application from these tracked files.

The following are intentionally **not** stored in GitHub:

- `.env.local` and all real API keys
- Supabase user records, storage objects, and production data
- GitHub, Vercel, Supabase, Resend, or Ollama account sessions
- local build output, dependency folders, and Codex conversation history

## Handoff procedure

1. Give the destination account access to
   `praxizofficial-cmd/PRAXIZ` using the minimum GitHub repository role it needs.
   Do not share a personal access token or browser session.
2. In the destination Codex account, connect the destination GitHub identity and
   clone the repository from `main`.
3. Confirm that the checkout is current:

   ```bash
   git fetch origin
   git status -sb
   git log -1 --oneline
   ```

   The branch should report `main...origin/main` with no uncommitted files.
4. Install the Node.js version declared in `package.json`, then install the
   locked dependencies:

   ```bash
   npm ci
   ```

5. Copy `.env.example` to `.env.local` and enter the destination account's
   authorized configuration. Exchange secrets through the relevant provider's
   secret manager, never through GitHub, Codex chat, screenshots, or commits.
6. Run the full repository validation before making changes:

   ```bash
   npm run release:check
   ```

7. Start the local application with `npm run dev` and verify authentication and
   the workspace for each of the five authorized roles.

## External services

GitHub access alone does not transfer ownership or authorization for external
services.

### Supabase

- Invite the destination operator through Supabase organization/project access.
- Keep Row Level Security enabled and preserve the existing role checks.
- Provide only the browser-safe project URL and publishable key to the app.
- Never place a service-role key in a `NEXT_PUBLIC_` variable.
- Do not replay migrations against production merely to validate the handoff.
  The checked-in migrations are history; production remains authoritative.

### Vercel

- Invite the destination operator to the existing Vercel project if production
  continuity is required, or import the GitHub repository into a new project.
- Configure environment variables in Vercel rather than committing them.
- If the canonical domain changes, update `NEXT_PUBLIC_SITE_URL` and the allowed
  Supabase authentication redirect URLs together.
- Validate a Preview deployment before changing the production domain or alias.

### Optional services

Resend and the configured Ollama-compatible AI endpoint require separate account
access and server-only environment variables. The application must continue to
fail clearly when an AI provider is unavailable; it must not replace unavailable
results with fabricated responses.

## Codex-specific notes

- Codex chats, local worktrees, approvals, and saved credentials are not part of
  the Git repository and do not migrate with it.
- `.openai/hosting.json` identifies an existing hosting project. Access to that
  project is account-specific; reconnect or replace it only when intentionally
  moving that hosting integration. It is not needed for the Vercel build.
- Review `README.md`, this guide, and the current `git status` before editing.
  Preserve existing uncommitted work if a handoff occurs mid-task.

## Completion checklist

- Destination account can clone and fetch `main`.
- `npm ci` succeeds without local dependency reuse.
- `.env.local` exists only on the destination machine or hosting platform.
- `npm run release:check` passes.
- All five role workspaces enforce their existing permissions.
- Supabase RLS remains enabled and no service-role client is introduced.
- Preview authentication callbacks, private files, and AI failure handling are
  verified before production access is transferred.

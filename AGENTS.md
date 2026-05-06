# AGENTS.md

## Project

Operational web panel built with Next.js + TypeScript + MongoDB for route management, trip assignment, and live monitoring.
It exposes APIs consumed by the `copilotGM` mobile app.

## Related Projects

- Mobile app (React Native): `D:\CopiaD\backUp\Proyectos App\copilotGM`
- This web panel (Next.js): `D:\CopiaD\backUp\Proyectos Web\copilot-web`

## How To Work

- Before touching code, first explain what is proposed, how it will be done, and where.
- Do not modify any code until the user explicitly approves the proposed plan.
- Make minimal, clear, and easy-to-verify changes.
- Do not refactor unrelated parts.
- Move in stages, prioritizing small changes.

## Rules

- Use TypeScript where applicable.
- Do not add libraries unless truly necessary.
- Do not duplicate logic.
- Do not use hacks.
- Do not leave dead code.
- Do not break existing API contracts with the mobile app.
- Never commit or push directly to `main`.
- Before any commit, run `npm run build` and ensure it finishes successfully.
- Never commit if `npm run build` fails.

## Structure

- `app`: pages and route handlers (`app/api`)
- `components`: UI and layout
- `lib`: auth, DB, google maps, route/policy utilities
- `models`: Mongoose schemas
- `public`: assets

## Main Modules

1. Auth and session (`/login`, `/register`, `lib/auth.ts`, `proxy.ts`)
2. Routes (`/routes`, `/routes/editor`, `/routes/marks`, compile/validate/merge APIs)
3. Trips (`/trips`, `/trips/live`, trip-plans and trips APIs)
4. Administration (`/admin`, admin APIs)

## App <-> Web Contract (Critical)

- Keep stable:
  - JWT payload (`user.id`, `user.role`)
  - trip statuses (`active`, `paused`, `finished`, `aborted`)
  - route structure (`google.steps`, `google.densePath`, `policyPack`)
- If an endpoint/payload used by mobile changes, update mobile and document migration.

## Environment Variables

- `DATABASE_URL` (required)
- `SECRET_WORD` (required)
- `GOOGLE_MAPS_API_KEY` (required for compile/repair)
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (frontend map)

## Backend/API

- Validate inputs and roles in each handler.
- Do not leak sensitive data (passwords/tokens).
- Keep consistent responses (`ok`, `error`/`message`, `items`/`item`).

## Validation

- Review types.
- Review imports.
- Verify main flow.
- Report touched files and what to test.
- Test affected endpoints with success and error cases.

## Useful Commands

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Branch Discipline

When changing work topic (feature/bugfix/chore area), switch to a branch that matches the new topic before making any commit.

Mandatory flow:
1. Check current branch status first.
2. If there are pending local changes (not committed or not pushed), do not switch branch automatically.
3. In that case, stop and ask the user how to proceed.
4. Only switch branch when the current branch is clean (no pending commit/push work).
5. Create a new branch or checkout an existing matching branch.
6. Confirm branch name matches the new topic.
7. Only then stage, commit, and push.

Never keep committing unrelated topics to the same long-lived branch.
Never change branch while there are pending changes unless the user explicitly approves the action.


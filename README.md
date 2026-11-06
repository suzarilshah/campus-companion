# Campus Companion — an independent re:Invent 2026 explorer

Walk a tiny-planet Las Vegas Strip, collect stamps in your event passport, and plan your real re:Invent 2026 week with the AWS Events API.

- **Hosted preview:** [campus-companion-blond.vercel.app](https://campus-companion-blond.vercel.app). It shows the globe, exploration, the passport and the AI Strip guide, with EXP saved in your browser. It has no sign-in and no sessions.
- **Full app (local):** run it on your own computer (below) to sign in with your registered AWS Builder ID. Then you can browse the real catalog, favorite sessions, reserve seats, and turn reservations into passport stamps.

**Why local?** AWS attendee sign-in only redirects back to an app on the attendee's own computer (loopback callback ports 8484–8489). The hosted site therefore never handles AWS tokens or attendee data.

**Status:** in development. Typecheck, 33 unit tests, 26 Chromium tests and an axe WCAG 2.2 AA scan (0 violations on all three pages) pass as of 2026-11-05. Real Builder ID sign-in and attendee writes have not been verified against a live account. AI suggestions are implemented and tested with a fake model; real Bedrock/SageMaker calls need your AWS configuration. See the [build log](docs/build-log.md) for exactly what was run.

This is an independent project and is not an official AWS app. All artwork is original, and the visual style is inspired by the public re:Invent site without using AWS logos, photography or fonts.

## Run locally

Prerequisite: Node.js **22.12+** and npm (a current LTS Node release is recommended). Verified locally on macOS with Node 25.2.1; Windows and Safari compatibility have not been verified.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:8484** for the planning desk and **http://127.0.0.1:8484/map** for the full-page 3D world. The Node server binds only to this computer's loopback interface. Stop with Ctrl+C. If the port is occupied, stop the other process; `PORT` may select another port, but sign-in works only on the registered callback ports 8484–8489.

To run the production build locally:

```sh
npm run build
npm start
```

Product pages show **no synthetic session records**. The code displays re:Invent 2026 sessions only after a registered Builder ID signs in and the catalog is loaded. Without sign-in, the globe and guest exploration EXP are available, but no sessions are shown. Illustrated places, roads, food carts and shuttle stops are **not** real-world wayfinding data; test fixtures are synthetic and stay in tests.

### Optional: Neon Postgres for EXP

Set `DATABASE_URL` in git-ignored `.env.local` (already linked via Neon CLI according to [the build log](docs/build-log.md)) or in `.env` if you explicitly intend to use Neon. Never commit or paste its value into chat. `npm run db:verify` is a **live write/delete probe** that creates the `campus_progress` table if needed; the build log records one completed probe. The server selects Neon when `DATABASE_URL` is set; otherwise EXP uses git-ignored `.local/progress.json`. Authenticated progress is keyed by a SHA-256 hash of the ID token subject; guest progress uses a local guest identity. No hosted database connection has been verified.

### Explore the world

`/map` is a tiny-planet **illustration** of a looping Las Vegas Strip, lined with go-kart kerbs. The six venue names and some event roles are sourced; their spacing, sides, roads, food spots and shuttle stops are not physical directions. Walk into places to earn EXP, encounter an illustrative shuttle, press Shift to run, and change outfits. The visitor uses WASD/arrows or on-screen controls; hotel/minimap/ground clicks request an illustrated route around obstacles. Day/Sunset/Night and optional **Ambient life** are present. Once connected locally, the map attempts to load the real catalog and schedule: pins denote sessions/reservations/favorites, with day/topic/format/text filters and reviewed favorite and reservation actions. These attendee flows have **fixture tests only**, not a real account smoke test.

- `/map` is the **dedicated full-viewport world**; `/` is the 2D planning desk. Direct entry/reload works on both production and development servers. The dashboard does not download the 3D renderer.
- Drag to look around; wheel/pinch to zoom and Q/E to turn. Select a venue label or minimap control to request a route to its illustrated plaza. Walking is on by default on `/map`; use WASD, arrow keys or the on-screen pad. The world wraps around a globe, not a flat island.
- **Overview** pulls back the camera. **Lighter graphics** reduces scene detail; **Reduce motion** limits transitions. A missing or lost WebGL context provides a link to the 2D planning desk.
- The six venue **names** come from the official 2026 agenda; the geometry, positions and paths are original **illustrations**, not an official walking map or booth floor plan. No building interiors or booth coordinates are present in the Events API. See [scene budgets](docs/scene-budget.md) and [map sources/gaps](docs/map-sources.md).
- No Google Maps tiles, routes, embedded floor plans or place data position this 3D scene. See [map provenance](docs/map-sources.md) for official external information and remaining data gaps.
- A signed-in visitor can return directly to `/map` after local OAuth; the map attempts one catalog/schedule load. Venue matching is normalized only for case, spacing and a leading “The”; unmatched sessions stay listed off-map. Session and booking controls exist on both the map and planning desk, so do not assume all attendee actions are confined to `/`.

### Live attendee verification — run in your own browser

This integration is implemented against the dated public OpenAPI snapshot and tested with synthetic responses. **No successful real-attendee sign-in is claimed yet.**

1. Run the app on port 8484 (or another registered port from 8484–8489). Use a normal browser on the same computer, not a shared/recorded automated browser.
2. On the planning desk, select **Sign in with AWS Builder ID**, or use the sign-in step on the map. The browser navigates to the official AWS OAuth page; sign in with your registered attendee account. No Bedrock or SageMaker credentials are involved in Builder ID sign-in.
3. Back in the app, choose **Load my catalog and schedule**. Catalog pagination runs to completion; schedule entries, missing metadata and errors are displayed explicitly. Local raw session times retain their supplied timezone; a missing timezone is never inferred.
4. Inspect a session; `GetSession` is used for details and seat rechecks. Optional: review a favorite, reservation or cancellation and confirm **only if you want to change your actual account**. A favorite is not a reservation. The implemented write paths reconcile from `GetSchedule` and do not blindly retry uncertain outcomes, but have not been tested on a real attendee account.
5. Choose **Disconnect this app** to revoke the refresh token and clear local credentials. A separate link offers full Builder ID browser sign-out. If revocation fails, the app reports it and lets you retry rather than claim success. Stopping the server clears in-memory state but does not itself revoke issued tokens.

Never paste codes, tokens, cookies or credentials into chat/issues. Report success/failure or a sanitized on-screen error. Automated tests do not authenticate or perform attendee writes. Live calls have timeouts, fixed AWS hosts, redirect rejection, per-operation pacing, one `401` refresh/retry, and explicit `403/409/429` handling.

Local session cookies are HttpOnly/SameSite=Lax; mutation requests require an exact Origin and per-session CSRF token. Token and catalog state stay in memory, scoped to the browser session. The server has no request logging for OAuth callbacks. Real-account behavior is a release gate; consult [the build log](docs/build-log.md).

## Verification

```sh
npx playwright install chromium
npm run check
npm run check:clean
```

`check` runs TypeScript, Node boundary/domain tests, the production build, and Chromium interaction tests against an isolated loopback server on port 8485. Tests fail rather than reuse an unknown process on that port. `check:clean` copies source into a temporary directory, performs `npm ci`, runs the same checks and removes the temporary directory on success (preserving failure evidence). An actual fresh Git clone has not been tested because this independent repo has no commits yet.

Playwright traces/reports, `.local`, original reference artifacts, `.env*`, build output and dependencies are ignored by Git. No live account is involved in automated tests.

## Documents

- [Product requirements and staged acceptance gates](docs/PRD.md)
- [Repeatable engineering/verification loop](docs/engineering-loop.md)
- [Confirmed and open decisions](docs/decisions.md)
- [Build progress and verified results](docs/build-log.md)
- [API contract and snapshot strategy](docs/api-contract.md)
- [Map sources, verified API behavior and missing data](docs/map-sources.md)
- [Repository instructions for future development sessions](AGENTS.md)

## AI suggestions (secure by design)

Four AI features run in the **local app** after you sign in and load your catalog:
- **Plan my day:** a concierge on the planner.
- **Fill my free time:** suggestions for gaps in My schedule.
- **Building guide:** questions answered on the map when you arrive at a building.
- **Summarise this session:** a summary of one session's abstract.

How they stay safe ([full design](docs/ai-plan.md)):
- **Grounded.** The local server shortlists your real catalog first, excluding reserved, full and clashing sessions. The model only ranks and explains that shortlist.
- **Minimal data.** The model sees session metadata and your question with emails, phone numbers and card numbers scrubbed. It never sees Builder ID tokens, cookies or your identity.
- **Constrained.** The model has no tools. Catalog text is passed as JSON data, the reply must be strict JSON, and every session ID is checked against the shortlist. Links and markup are stripped.
- **You stay in control.** Suggestions only fill the existing reservation tray or favorite review. Nothing is booked without your confirmation and a GetSchedule check.
- **Limited.** The local server only accepts AI requests from this app's own page (anti-forgery check). They are limited to 10 per minute with a 20-second timeout and 600 output tokens, and fall back to labelled keyword matches if the model is off or fails.

Configure **Amazon Bedrock** (Converse, optional Guardrail) or an **Amazon SageMaker** real-time endpoint in `.env.local` (see `.env.example`). With nothing configured, AI stays off. The tested setup is **Kimi K2.5 on Amazon Bedrock** (`moonshotai.kimi-k2.5`, us-east-1):

```sh
aws login --profile campus-companion --region us-east-1   # AWS CLI 2.32+; approve in the browser, no keys to copy
```

Then add `AI_PROVIDER=bedrock`, `BEDROCK_MODEL_ID=moonshotai.kimi-k2.5`, `AI_AWS_PROFILE=campus-companion` and `AI_AWS_REGION=us-east-1` to `.env.local`, and restart `npm start`. The startup line shows `AI: Amazon Bedrock · …`. `scripts/aws-signin.sh` is a guided alternative for IAM Identity Center (SSO) users.

## Hosted Strip guide (AI on the live site)

The live site has an **Ask the Strip guide** panel, on the globe and on the planner. It runs **Kimi K2.5 on Amazon Bedrock** through one Vercel function (`POST /api/guide`):
- **Grounded:** it answers only from Campus Companion's sourced facts (the six venues and what each hosts, the illustrated places with their provenance, the passport rules, how to use the site). Anything else gets a fixed refusal.
- **No catalog:** it cannot see sessions, times or rooms, and says so.
- **Constrained:** it has no tools and no browsing. The question is passed as JSON data, the reply must be strict JSON, links and markup are stripped, and place IDs are checked against an allow-list.
- **No keys:** Vercel's per-request OIDC token is exchanged for a role that can only `bedrock:InvokeModel` on `moonshotai.kimi-k2.5` in us-east-1, and only from the production deployment. One-time setup: `bash scripts/setup-guide-aws.sh`.
- **Bounded cost:** 5 questions per visitor per 10 minutes and 20 per day (keyed on a salted IP hash), 30 per minute and **500 per day site-wide**, 280-character questions, 350 output tokens, and a 15-second timeout. Identical questions are served from a cache. At $0.60/$3.00 per million input/output tokens that is at most about $1.15 a day. Counters live in Neon. If the counter store is down, no model call is made.
- **Hardened page:** same-origin checks on the function, and a strict Content-Security-Policy, HSTS and frame-blocking headers on every page.
- **Kill switch:** set `GUIDE_ENABLED=0` in Vercel and redeploy, or run `bash scripts/setup-guide-aws.sh --remove` to cut off AWS access.

## SageMaker / Jupyter playbook

[`notebooks/campus-companion-playbook.ipynb`](notebooks/campus-companion-playbook.ipynb) runs in SageMaker Studio or local Jupyter on a **synthetic** catalog. It tours the Events API contract, runs the same shortlist, prompt and validator as the app, and calls your SageMaker endpoint or Bedrock. It also red-teams the defences: prompt injection, invented IDs, PII and malformed output. Without AWS settings it runs offline against an adversarial fake model. To regenerate it, run `uv run --with nbformat python notebooks/build_playbook.py`.

## Distribution

- **Hosted preview (Vercel, static):** built with `VITE_HOSTED=1` (see `vercel.json`). It makes no `/api` calls, so there is no sign-in, no sessions and no writes to AWS. Exploration EXP stays in the visitor's browser (`localStorage`). Planning EXP is never granted there, because it needs GetSchedule. Neon writes from the hosted site (D-27) remain off until rate limiting and a privacy notice are added.
- **Attendee mode (local):** a loopback-only Node server holds Builder ID tokens in memory and calls the Events API.

Official API source of truth: [AWS Events OpenAPI](https://api.awsevents.com/v1/openapi.json) and [AWS Events developer guide](https://docs.aws.amazon.com/events/latest/devguide/). AWS requires a registered attendee to sign in **locally** for re:Invent catalog access and personal schedule operations. This project is independent and is not an official AWS event map or registration service.

## License

[MIT](LICENSE) © 2026 Suzaril Shah. AWS, re:Invent and related marks belong to Amazon.com, Inc. or its affiliates; this project is independent and not endorsed by AWS.

# Campus Companion — an independent re:Invent 2026 explorer

Walk a tiny-planet Las Vegas Strip, collect stamps in your event passport, and plan your real re:Invent 2026 week with the AWS Events API.

- **Hosted preview:** [campus-companion-blond.vercel.app](https://campus-companion-blond.vercel.app). It shows the globe, exploration and the passport only, with EXP saved in your browser. It has no sign-in and no sessions.
- **Full app (local):** run it on your own computer (below) to sign in with your registered AWS Builder ID. Then you can browse the real catalog, favorite sessions, reserve seats, and turn reservations into passport stamps.

**Why local?** AWS attendee sign-in only redirects back to an app on the attendee's own computer (loopback callback ports 8484–8489). The hosted site therefore never handles AWS tokens or attendee data.

**Status:** in development. Typecheck, 33 unit tests, 26 Chromium tests and an axe WCAG 2.2 AA scan (0 violations on all three pages) pass as of 2026-11-05. Real Builder ID sign-in and attendee writes have not been verified against a live account. The AI concierge has not been implemented. See the [build log](docs/build-log.md) for exactly what was run.

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

## Distribution

- **Hosted preview (Vercel, static):** built with `VITE_HOSTED=1` (see `vercel.json`). It makes no `/api` calls, so there is no sign-in, no sessions and no writes to AWS. Exploration EXP stays in the visitor's browser (`localStorage`). Planning EXP is never granted there, because it needs GetSchedule. Neon writes from the hosted site (D-27) remain off until rate limiting and a privacy notice are added.
- **Attendee mode (local):** a loopback-only Node server holds Builder ID tokens in memory and calls the Events API.

Official API source of truth: [AWS Events OpenAPI](https://api.awsevents.com/v1/openapi.json) and [AWS Events developer guide](https://docs.aws.amazon.com/events/latest/devguide/). AWS requires a registered attendee to sign in **locally** for re:Invent catalog access and personal schedule operations. This project is independent and is not an official AWS event map or registration service.

## License

[MIT](LICENSE) © 2026 Suzaril Shah. AWS, re:Invent and related marks belong to Amazon.com, Inc. or its affiliates; this project is independent and not endorsed by AWS.

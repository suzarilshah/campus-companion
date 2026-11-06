## What I built

**Campus Companion** turns the re:Invent 2026 catalog into a place you can walk around. A tiny-planet Las Vegas Strip holds the six real 2026 venues (Encore, Wynn, The Venetian, Caesars Palace, Caesars Forum, MGM Grand). Walk your blocky avatar up to a building and the side panel shows **only that building's sessions**, loaded live from the AWS Events API. From there you can favorite sessions, put seats in a reservation tray, and reserve them — every write goes through a review step and is checked against `GetSchedule` before the app says it happened.

It has three parts:

- **Planner** – the full catalog with search, topic/day/format filters that live in the URL, a reservation tray, and *My schedule* grouped by day with clash hints.
- **Strip globe** – the 3D world (React Three Fiber): click-to-walk with pathfinding, a shuttle you can ride, an indoor explorer that stacks a building's floors from the API's room strings and routes you to a room, and a minimap.
- **Event passport** – venue stamps, quests and EXP for exploring, plus *session stamps* that appear only when a reservation is confirmed by `GetSchedule`.

## Why

re:Invent is 2,000+ sessions spread across six venues on the Strip. The hard part isn't finding *a* session — it's building a week that actually works when you have to walk between hotels. I wanted planning to feel like exploring: you see where things are, you notice what's on in the building you're standing in, and the boring-but-critical parts (clashes, full sessions, reservation windows) are handled honestly.

## How it uses the Events API

| Operation | What the app does with it |
|---|---|
| `GetEvent` | Event name, dates, timezone and city in the map and planner |
| `ListSessions` | Pages until `nextToken` ends; sessions are matched to venues by name (unmatched venue strings are listed, never guessed) |
| `GetSession` | Fresh details when you open a card; "Re-check seats" refreshes availability bands |
| `GetSchedule` | Reserved, favorited and personal time; re-read after **every** change and when you return to the tab |
| `AssociateFavorites` / `DisassociateFavorite` | Only after an explicit confirm; a favorite is never shown as a seat |
| `ReserveSessions` / `CancelReservation` | 1–10 sessions per confirmed request, results read **per session** (a 200 can still contain failures), mapped to plain-language reasons like `scheduleConflict`; 409 before Oct 8 is explained; uncertain results are never blindly re-sent |

Sign-in is the attendee's own Builder ID via OAuth **PKCE on a loopback callback** (127.0.0.1:8484–8489). Tokens live only in the local server's memory behind an HttpOnly cookie, CSRF and Origin checks — the browser, the AI and the hosted site never see them.

## AI, done safely

- **Local AI concierge (Amazon Bedrock, Kimi K2.5):** *Plan my day*, *Fill my free time*, a *Building guide* on the map, and *Summarise this session*. The server first builds a deterministic shortlist from your loaded catalog (excluding reserved, full and clashing sessions). The model only ranks and explains that shortlist, gets no tokens or identity, has no tools, must answer in strict JSON, and every session ID it returns is checked against the shortlist. Suggestions only fill the existing review flows — the AI can't book anything.
- **Hosted "Strip guide":** on the live site, a guide answers questions about the venues, the globe and the passport — grounded only in the app's sourced facts, refusing everything else. It runs in a Vercel function that gets AWS access through **OIDC federation** (no stored keys) into a role that can call exactly one Bedrock model, with per-visitor and site-wide daily quotas in Neon Postgres that fail closed.
- **SageMaker / Jupyter playbook:** a notebook that tours the Events API contract, runs the same shortlist/prompt/validator in Python, calls Bedrock or a SageMaker endpoint, and red-teams the defences (prompt injection in abstracts, invented IDs, PII, malformed output) — 6/6 cases pass against Kimi K2.5.

## Architecture

- **Local attendee app:** React + Vite front end, Express server bound to loopback only (DNS-rebinding and cross-site guards), Events API REST client with rate spacing, Neon Postgres for EXP (tied to a SHA-256 hash of the Builder ID subject, never the token or email).
- **Hosted preview (Vercel):** the same front end in a no-sign-in mode — globe, passport, browser-local EXP and the AI Strip guide — with a strict Content-Security-Policy.
- **Quality:** 48 unit tests (including AI security tests) and 28 Playwright browser tests; axe-core accessibility scans report 0 WCAG 2.2 AA violations; keyboard, screen-reader and reduced-motion support.

## Try it

- **Live preview:** https://campus-companion-blond.vercel.app — explore the globe, collect stamps, ask the Strip guide.
- **Full app with your real schedule:** clone the repo, `npm ci`, `npm run dev`, open http://127.0.0.1:8484 and sign in with the Builder ID you registered with (AWS only allows attendee sign-in back to an app on your own computer, which is why the live preview can't show your sessions).

## Honest limits

The globe is an original, illustrative map — not to scale, not official wayfinding. Shuttle stops and food spots are marked illustrative because official pages don't publish them, and Expo booth numbers are shown as "not published". Nothing in the app invents sessions, rooms, times or availability; tests use clearly synthetic fixtures. Campus Companion is an independent project, not an official AWS app.

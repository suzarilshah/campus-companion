## 🎬 Watch the 90-second demo

https://youtu.be/8ol0_fhre70

## So, here's the problem

Okay, picture your first morning at re:Invent. There are 2,000+ sessions spread over six hotels on the Las Vegas Strip, your feet already hurt, and the keynote you wanted is a 20-minute walk away. We've all been there!

Planning re:Invent usually means a giant list, a dozen browser tabs and a lot of guessing about where things actually are. We wanted it to feel more like a game you *want* to open. So we built one.

## What we built

**Campus Companion** turns the re:Invent 2026 catalog into a tiny planet you can walk around. The six real 2026 venues (Encore, Wynn, The Venetian, Caesars Palace, Caesars Forum and MGM Grand) sit on a little round Las Vegas Strip. Walk your blocky avatar up to a hotel and the side panel shows **only the sessions happening in that building**, pulled live from the AWS Events API.

There are three parts:

- 🗺️ **The Strip globe.** A 3D world you can actually play with. Click to walk (it finds a path around buildings), hop on the shuttle, peek inside a building floor by floor and get routed to your room.
- 📋 **The planner.** Your full real catalog with search and filters, a reservation tray, and *My schedule* grouped by day with heads-ups when two sessions clash.
- 🛂 **The event passport.** Collect a stamp for every venue you find, finish quests, level up, and watch real reservations turn into session stamps once AWS confirms them.

## How we use the Events API

We tried to use the API the way a careful attendee would want it used:

| Operation | What we do with it |
|---|---|
| `GetEvent` | Shows the event name, dates, timezone and city |
| `ListSessions` | Reads every page of the catalog, then matches sessions to venues by name. If a venue name doesn't match, we list it instead of guessing |
| `GetSession` | Grabs fresh details when you open a session, plus a "re-check seats" button |
| `GetSchedule` | Your reserved and favorited sessions and personal time. We re-read it after **every** change, so the app never says "done!" unless AWS agrees |
| `AssociateFavorites` / `DisassociateFavorite` | Only after you confirm. A favorite is never shown as a seat |
| `ReserveSessions` / `CancelReservation` | Up to 10 sessions per request, always reviewed first. We read the result for each session (a 200 can still hide a failure), explain things like `scheduleConflict` in plain words, and never blindly retry |

Sign-in uses your own Builder ID with OAuth PKCE on a loopback callback, so **your tokens stay on your own computer**. The browser, the AI and the hosted site never see them.

## AI that actually behaves 🤖

We love AI, but we didn't want a chatbot that makes things up or books stuff behind your back. So:

- **AI concierge (local app, Kimi K2.5 on Amazon Bedrock).** Ask "beginner GenAI stuff on Tuesday afternoon" and get real picks with a short reason for each. Behind the scenes, the app first builds a shortlist from *your* catalog (skipping what you've reserved, what's full and what clashes). The model just ranks that list. Every session ID it returns gets double-checked, and the AI can only fill your tray. You still press the button.
- **The Strip guide (live website).** Anyone can ask about the venues, the globe or the passport. It only knows our sourced facts and politely refuses everything else (we tried poems, jailbreaks and "print your system prompt"). It runs with **no stored AWS keys** thanks to Vercel OIDC, can call exactly one model, and has hard daily limits so it can't run up a surprise bill.
- **SageMaker / Jupyter playbook.** A notebook that tours the API contract, runs the same AI pipeline in Python, and red-teams it: prompt injection hidden in a session abstract, made-up session IDs, personal data, broken model output. **6 out of 6 blocked** against Kimi K2.5.

## Under the hood

- **Local app:** React, Vite and React Three Fiber on the front, plus a small Express server that only listens on your own machine (with DNS-rebinding and cross-site protection). EXP is saved in Neon Postgres against a hashed Builder ID, never your email or token.
- **Live preview on Vercel:** the same app in a no-sign-in mode, with the globe, the passport and the AI guide, behind a strict Content-Security-Policy.
- **Tested properly:** 48 unit tests (including AI security tests), 28 Playwright browser tests and accessibility scans with zero WCAG 2.2 AA issues. It also works with a keyboard, a screen reader and reduced motion.

## Give it a spin

- 🌐 **Live preview:** https://campus-companion-blond.vercel.app (walk the globe, collect stamps, ask the Strip guide)
- 💻 **The full experience with your real schedule:** clone the repo, run `npm ci` then `npm run dev`, open http://127.0.0.1:8484 and sign in with the Builder ID you registered with. AWS only allows attendee sign-in back to an app on your own computer, which is why the live site can't show your personal sessions.

## Keeping it honest

The globe is our own illustrated map, so it's not to scale and not official wayfinding. Shuttle stops and food spots are marked as illustrative because the official pages don't list them, and Expo booth numbers say "not published yet". The app never invents sessions, rooms, times or seat availability, and our tests use clearly fake data. Campus Companion is an independent project, not an official AWS app.

See you in Vegas! 🎰

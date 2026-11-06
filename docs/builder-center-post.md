## 🎬 Watch the 70-second demo

https://youtu.be/IYVP6AvUbF8

## So, here's the problem

Okay, picture your first morning at re:Invent. There are 2,000+ sessions spread over six hotels on the Las Vegas Strip, your feet already hurt, and the keynote you wanted is a 20-minute walk away. We've all been there!

Planning re:Invent usually means a giant list, a dozen browser tabs and a lot of guessing about where things actually are. So we asked a simple question: what if planning re:Invent felt like playing a game? 🎮

## 🕹️ Walk the Strip (yes, actually walk it)

**Campus Companion** turns re:Invent into a tiny planet you can explore. The six real 2026 venues (Encore, Wynn, The Venetian, Caesars Palace, Caesars Forum and MGM Grand) sit on a little round Las Vegas Strip, and you get a blocky avatar to roam it.

- **Move like a game.** W, A, S, D to walk, hold Shift to sprint, drag to spin the globe, or just click anywhere and your avatar finds its own path around the buildings. Flip between the full globe and a street-level chase camera.
- **Ride the shuttle.** Stand at a blue shuttle stop, pick a destination and ride across the Strip.
- **Earn EXP and level up.** Every venue, landmark, food spot and shuttle stop you discover pops an EXP reward. Finish quests like *Strip explorer*, *Ride along* and *re:Play scout*, and climb from Newcomer to Wanderer, Pathfinder and all the way to Campus legend.
- **Collect your passport.** A proper event passport page with stamps for every venue you've visited, your level, your quests, and session stamps for every seat AWS confirms you've reserved.
- **Peek inside.** Walk up to a hotel and the side panel shows **only the sessions happening in that building**, live from the AWS Events API. Tap *Explore inside* to see the building floor by floor and get routed to the right room.

## ⚡ Let the AI book your seats

This is our favorite part. Tell the AI what you're into, like *"beginner GenAI stuff on Dec 1, book me in!"*, and it:

1. Picks real sessions from **your** catalog that fit your day, each with a short reason (Kimi K2.5 on Amazon Bedrock).
2. Skips anything you've already reserved, anything that's full and anything that clashes with your schedule.
3. Gives you a **"⚡ Reserve all of these"** button. One tap puts them in your reservation tray, you hit **Confirm**, and the seats are booked with `ReserveSessions`. Then the app checks `GetSchedule` and gives you the EXP for it. 🎉

Why the one confirm? Because nobody wants an AI booking their week behind their back. The AI does the searching and the busywork, and you stay in charge of the final click.

There's also a **building guide** on the map ("anything hands-on here?"), a **fill my free time** helper for the gaps in your day, and a one-tap **session summary**.

## How we use the Events API

| Operation | What we do with it |
|---|---|
| `GetEvent` | Shows the event name, dates, timezone and city |
| `ListSessions` | Reads every page of the catalog, then matches sessions to venues by name. If a venue name doesn't match, we list it instead of guessing |
| `GetSession` | Grabs fresh details when you open a session, plus a "re-check seats" button |
| `GetSchedule` | Your reserved and favorited sessions and personal time. We re-read it after **every** change, so the app never says "done!" unless AWS agrees |
| `AssociateFavorites` / `DisassociateFavorite` | Only after you confirm. A favorite is never shown as a seat |
| `ReserveSessions` / `CancelReservation` | Up to 10 sessions per request, including the AI's "Reserve all". We read the result for each session (a 200 can still hide a failure), explain things like `scheduleConflict` in plain words, and never blindly retry |

Sign-in uses your own Builder ID with OAuth PKCE on a loopback callback, so **your tokens stay on your own computer**. The browser, the AI and the hosted site never see them.

## 🌐 The live site and the Strip guide

The live site lets anyone walk the globe, ride the shuttle, level up and fill a passport (saved in your browser). It also has the **Strip guide**, an AI you can ask about the venues, the map and the passport. It only knows our sourced facts and politely refuses everything else (we tried poems, jailbreaks and "print your system prompt"). It runs with no stored AWS keys thanks to Vercel OIDC, can only call one model, and has hard daily limits so it can't run up a surprise bill.

We also built a **SageMaker / Jupyter playbook** that red-teams the AI with prompt injection, made-up session IDs, personal data and broken model output. **6 out of 6 blocked** against Kimi K2.5.

## Under the hood

- **Local app:** React, Vite and React Three Fiber, plus a small Express server that only listens on your own machine. EXP is saved in Neon Postgres against a hashed Builder ID, never your email or token.
- **Live preview on Vercel:** the same app in a no-sign-in mode, behind a strict Content-Security-Policy.
- **Tested properly:** 48 unit tests, 29 Playwright browser tests (including the AI booking flow) and accessibility scans with zero WCAG 2.2 AA issues. It also works with a keyboard, a screen reader and reduced motion.

## Give it a spin

- 🌐 **Play it now:** https://campus-companion-blond.vercel.app (walk the globe, ride the shuttle, level up, ask the Strip guide)
- 💻 **The full experience with your real schedule and AI booking:** clone the repo, run `npm ci` then `npm run dev`, open http://127.0.0.1:8484 and sign in with the Builder ID you registered with. AWS only allows attendee sign-in back to an app on your own computer, which is why the live site can't show your personal sessions.

## Keeping it honest

The globe is our own illustrated map, so it's not to scale and not official wayfinding. Shuttle stops and food spots are marked as illustrative because the official pages don't list them, and Expo booth numbers say "not published yet". EXP is for exploring the map and for reservations AWS confirms, not a record of real attendance. The app never invents sessions, rooms, times or seat availability, and our tests use clearly fake data. Campus Companion is an independent project, not an official AWS app.

See you in Vegas! 🎰

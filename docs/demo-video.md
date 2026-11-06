# Demo video kit (about 3 minutes)

**Honesty rules for the video:** real session data appears only in shots you record yourself, signed in locally with your registered Builder ID. Automated B-roll uses visibly badged **synthetic demo data**. Never show tokens, cookies, `.env`, the Neon connection string, or your email on screen. Say that the globe is illustrative and not to scale.

## Assets ready now
- `scripts/record-demo.mjs` records 1280×720 B-roll clips into `.local/demo-video/` (git-ignored): planner hero, AI concierge, globe walk, building guide and passport. A rough cut of all five is in `.local/demo-video/rough-cut.mp4` (about 77 s, no audio).
- Re-record after any UI change: `npm run build && npm start`, then `node scripts/record-demo.mjs`.
- Notebook shots: open `notebooks/campus-companion-playbook.ipynb` in SageMaker Studio and run all cells. Film the red-team table (section 6).

## Script and shot list

| Time | Shot | Voice-over (suggested) | Source |
|---|---|---|---|
| 0:00–0:12 | Globe spins, avatar walks to the Venetian | “re:Invent is 2,000-plus sessions across six venues on the Las Vegas Strip. Campus Companion turns that into a world you can walk.” | `03-globe-walk` |
| 0:12–0:30 | Planner hero, then sign-in (**you record**: local app, Builder ID page, return) | “It’s built on the AWS Events API. You sign in with your own Builder ID on your own computer, and your tokens never leave it.” | `01-planner-hero` + your capture |
| 0:30–0:55 | Real catalog, filters, My schedule with clash hints (**you record**) | “Your real catalog and schedule: filter by day, topic and format, and see clashes before AWS does.” | your capture |
| 0:55–1:25 | AI concierge: type a question, picks with ✦ reasons, add to tray | “Ask for what you want. The AI only ranks a shortlist built from your loaded catalog. It skips what you’ve reserved, what’s full and what clashes, and it can’t book anything.” | `02-ai-concierge` |
| 1:25–1:45 | Review reservations → confirm → per-session result → GetSchedule (**you record**; reservations opened Oct 8) | “Every booking is reviewed, sent with ReserveSessions, read per session, and checked against GetSchedule. No blind retries.” | your capture |
| 1:45–2:05 | Map: arrive at Wynn, building guide answer, Explore inside | “Walk up to a building and it shows only that building’s sessions. Ask the guide, then route to the room.” | `04-building-guide` |
| 2:05–2:25 | Security slide (four bullets from the README) | “Grounded, minimal data, constrained output, and you confirm every write.” | slide |
| 2:25–2:45 | SageMaker Studio: playbook red-team table, 6/6 passing | “The SageMaker playbook red-teams it: prompt injection, invented sessions, personal data and malformed output.” | notebook |
| 2:45–3:00 | Passport stamps, then end card: repo, hosted preview, MIT | “Collect your passport stamps, then try it yourself. It’s open source, MIT licensed.” | `05-passport` + card |

## Recording checklist
- Close other apps and use a clean browser profile. Hide bookmarks and extensions, and zoom to 100%.
- Turn off notifications. Use a 1920×1080 or 1280×720 window.
- Sign in live only on the **local** app. Pause the recording while the AWS sign-in page shows your email.
- For real AI shots, set `AI_PROVIDER` in `.env` first (see `.env.example`), and check that the panel says “Suggested by Amazon Bedrock …” or “Amazon SageMaker …”.
- End card: `github.com/suzarilshah/campus-companion` · `campus-companion-blond.vercel.app` · “Independent project, not an official AWS app.”

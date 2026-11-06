# Product requirements: an explorable re:Invent companion

Status: working PRD, 29 September 2026. The participant approved the proposed stack, AWS Bedrock as AI provider, and warm miniature-diorama direction on this date. Product name, Bedrock model/region/cost setup, and later asset choices remain unresolved. This document is the product contract; implementation details must be validated in vertical slices under [the engineering loop](engineering-loop.md).

## 1. Product thesis

Build an independent, locally launched web experience that opens in a desktop browser. An attendee explores an original, stylized miniature re:Invent campus, discovers real 2026 sessions, and converses with a grounded concierge that helps them plan and adapt their day. Text is the default; push-to-talk is optional. The 3D world makes recommendations visible and memorable, while a fast 2D itinerary and list make the application useful when exploration is inconvenient.

**Product promise:** "Explore an imagined campus. Plan with real sessions."

The 3D geography is illustrative, not a physical wayfinding map. The attendee remains in control of favorites, reservations, cancellations, and personal-time changes. Responses never claim a seat was reserved merely because a request returned HTTP 200.

## 2. Contest and delivery context

- Contest period: September 24 through November 6, 2026, 11:59 p.m. PT; rules updated September 24, supplied by the participant. This private rules text is the source of truth for contest requirements until an updated version is provided.
- Eligible entrant requirements include current AWS Heroes or AWS Community Builders membership and re:Invent 2026 registration. The participant confirms both; other conditions in the supplied rules remain the participant's responsibility.
- Required submission: **one public repository** with working code and a README covering setup/dependencies/run instructions, plus a **published article on builder.aws.com** describing the build and use of the Events API and/or MCP server. A Vercel preview and custom domain are optional extras, not replacements.
- Judging: creativity/novelty, attendee utility, technical depth and API use, and quality of the published article. Design the demonstration to prove all four, not just visual appeal.
- Original code, art, writing, and interactions; inspiration from [Jalan KL](https://kl.jalanmalaysia.com/) must not become a copy of its assets, code, content, or visual identity. Do not imitate AWS Builder Center's trade dress or imply AWS endorsement ([AWS trademark guidelines](https://aws.amazon.com/trademark-guidelines/)).

## 3. Audience and jobs to be done

| Persona | Job | Evidence of success |
| --- | --- | --- |
| Registered attendee planning ahead | Find high-fit sessions across a large catalog without missing conflicts or breaks | Can compare, favorite, and plan a feasible day using real catalog data |
| Attendee with a changed plan | Recover from a full session, new meeting, or changed interest | Sees alternatives with clear reasons and does not accidentally cancel anything |
| First-time explorer | Understand re:Invent's spread of venues and experiences | Can discover a relevant session through the world or directly through search/list |
| Judge or prospective user without a registered account | Understand the experience and verify engineering quality | Can explore a clearly marked sample-data preview, then follow documented local setup for live mode |

The app does **not** have access to other attendees' schedules, booth inventory, real-time location, or event registration through the Events API.

## 4. Experience principles

1. **Every memorable interaction has utility.** A suggested path ends at a grounded session, an attendee decision, or a clearer itinerary.
2. **Explore or skip.** Overview/teleport, search, and itinerary are always available; never force a WASD journey to complete a task.
3. **Honest geography.** Display real venue and room names if provided; label travel guidance as approximate; never represent illustrative positions as official floor plans.
4. **Honest state.** Differentiate suggested, favorited, reserved, walk-up, unavailable, and unverified. Favorites are not reservations.
5. **Human agency.** AI proposes and explains; the attendee explicitly approves each write. Destructive actions have a review step.
6. **Accessible by design.** Keyboard-operable 2D equivalent, reduced-motion mode, legible text, sound off by default, and mobile-appropriate controls.

## 5. End-to-end journeys

### J1: Explore and plan

1. Launch the local browser app. See a small playable campus with a clear "illustrative map" notice and instant overview/search paths.
2. Sign in with AWS Builder ID on this machine and retrieve the registered attendee's 2026 catalog and schedule.
3. State a goal in text: "I have 90 minutes before lunch; find a hands-on AI session."
4. See two or three grounded options highlighted in the world and list. Each shows time, venue, session type, fit rationale, conflicts, and source metadata.
5. Open a session landmark, inspect its abstract and alternatives, favorite it on explicit action, and see the confirmed state in the notebook and schedule.

### J2: A plan changes

1. Mark a personal-time block or consider a conflicting session.
2. The concierge compares existing commitments, explains the trade-off, and proposes an alternative that actually fits the available interval.
3. Review the intended change before submitting it; reread `GetSchedule` to confirm the final state. If a write partially fails, show successful and failed items separately.

### J3: Seat reservation (when available)

1. Attendee confirms one or more proposed reservations.
2. App respects the 1–10 distinct ID limit, inspects each per-session result, and rereads schedule before making a success claim.
3. If full, conflicting, or closed (`409`), preserve existing itinerary and offer sensible alternatives. Prior to October 8, 2026, the API documents reservations/cancellations as closed; never simulate a real booking.

### J4: Hosted showcase

1. A visitor opens a Vercel preview with a clearly labeled, synthetic, non-personal sample itinerary.
2. They can tour the representative scene and understand the concierge's proposed/confirmed state distinction.
3. A link leads to the public code, documented local launch, and published Builder Center article. Preview is never presented as live attendee access.

## 6. Functional requirements

### 6.1 Discovery and world

- FR-01: An original low-poly/illustrative 3D campus with pan/orbit or walk/follow camera, clear controls, contextual landmarks, overview/teleport, and a minimap. Initial slice is deliberately small; complete named venue hubs only after real-data integration works.
- FR-02: Real 2026 session records populate cards and landmarks; multiple sessions per venue are browsed through cards/timeline, **not thousands of individually rendered objects**. When venue/room is missing, place the session in an "unplaced" list rather than inventing a location.
- FR-03: Venue names from the 2026 agenda include Caesars Forum, Caesars Palace, Encore, MGM Grand, The Venetian, and Wynn. Expo zones described on the 2026 site can inspire clearly attributed editorial landmarks; they are not Events API booth objects. Sponsor/booth locations and activities appear only if a usable, properly sourced and reusable dataset is confirmed.
- FR-04: Search/filter sessions locally by text, date/time, level, type, and available taxonomy (topics/tracks/services/roles), with graceful handling of absent fields. Pagination continues until `nextToken` is absent, not until a short page.
- FR-05: "Why this?" on every recommendation; link to the underlying session record; show competing options and how a new choice affects the day.
- FR-06: Optional exploration notebook for inspected/favorited/reserved sessions; avoid fabricating visit/attendance badges from browsing.

### 6.2 Agenda and attendee actions

- FR-07: Read reserved sessions, favorites, and personal time from `GetSchedule`; distinguish all three in UI. The API is authoritative, and the app reconciles after every change.
- FR-08: Favorite/unfavorite sessions with per-item error handling and confirmation from schedule. Never equate favorite with seat.
- FR-09: Create/edit/delete personal-time entries with documented required text lengths, UTC serialization, minute precision, 5-minute duration increments, and correct presentation in event-local time. Update is a **full replacement**; preserve optional fields unless the user clears them intentionally.
- FR-10: Reserve/cancel with explicit approval, reservation-window awareness, per-item success/failure explanations, and safe reconciliation after uncertain outcomes. No automatic polling/seat-grabbing loop.
- FR-11: A registration CTA may point to the **official** current re:Invent registration page; it does not claim to register via Events API. If the user is signed in but not registered, explain the `403` and offer official registration guidance.

### 6.3 Concierge and voice

- FR-12: Text conversation can answer catalog questions, propose sessions, compare alternatives, and narrate a schedule change with citations/links to actual session IDs and times. AI output is a proposal until independently checked against retrieved data.
- FR-13: Recommendation engine applies deterministic hard constraints (time intervals, reservations/personal time, missing fields) before softer AI reasoning/ranking. Optional travel buffer is user-controlled or labeled estimate, never asserted as a measured route.
- FR-14: AI may prepare a change preview but cannot invoke any write without an explicit per-action confirmation. An allowlisted tool adapter checks identity, event ID, session IDs, current schedule, and request limits independently of model-generated text.
- FR-15: Optional push-to-talk, spoken responses, mute, live transcript, and text fallback. Do not block the initial release on voice vendor selection or microphone availability.
- FR-16: Unsupported or stale data must be described as unknown. Do not assert live seat inventory beyond the coarse status returned by the API, and do not claim a successful write without post-write reconciliation.

### 6.4 Demo and content

- FR-17 (changed 2026-09-29, D-24): product pages show **no synthetic sessions**; synthetic fixtures are for automated tests only. Original text: Sample mode uses small **synthetic, clearly labeled** fixtures and no Events API writes. Fixture schema mirrors verified API behavior and demonstrates success, partial failure, unavailable operation, and recovery.
- FR-18: At submission, README includes supported desktop browsers/OS, prerequisites, one clear local start path, sign-in steps, sample mode, AI configuration, tests, limitations, and token handling; the Builder Center article includes architecture, original-work credits, sources, API operations, screenshots/video, and a reproducible demo scenario.
- FR-19 (participant-approved UX change 2026-09-29): `/map` is a full-viewport illustrative 3D experience with its own controls and a controllable person; `/` contains catalog, schedule, notebook and account workflows. Explicit links navigate between them. Real venue names may annotate the miniature campus, but no physical indoor navigation or booth pin is promised without licensed coordinates and floor plans. Update 2026-09-29 (D-17/D-18): the map is a stylized Las Vegas Strip with an animated, click-to-walk visitor and Events API overlays (per-venue session counts, reserved/favorite pins, filters); venue order along the Strip is approximate. This was added during the incomplete slice 2 at the participant's explicit request; its gate remains pending real attendee validation.

## 7. Events API coverage and integration contract

API base: `https://api.awsevents.com/v1`; canonical schema: [OpenAPI 3.1](https://api.awsevents.com/v1/openapi.json). Operation examples and semantics: [REST guide](https://docs.aws.amazon.com/events/latest/devguide/rest-api.html). `reinvent2026` requires a registered attendee's access token to read its catalog; the remote [MCP endpoint](https://docs.aws.amazon.com/events/latest/devguide/mcp-server.html) requires sign-in for *all* calls. Choose REST as the proposed app adapter; MCP remains an optional development/extension path, not an additional backend with broader permissions.

| Operations | Product use | Target slice |
| --- | --- | --- |
| ListEvents, GetEvent | Event verification/context | 1 / 2 |
| ListSessions, GetSession | Paginated catalog, session detail | 2 |
| GetSchedule | Source of truth before/after changes | 2 |
| AssociateFavorites, DisassociateFavorite | Notebook interest actions | 2 |
| CreatePersonalTime, UpdatePersonalTime, DeletePersonalTime | User commitments | 3 |
| ReserveSessions, CancelReservation | Seat management once open | 3, verified after October 8 |

Implementation rules from [quotas](https://docs.aws.amazon.com/events/latest/devguide/quotas.html) and [error semantics](https://docs.aws.amazon.com/events/latest/devguide/errors.html):

- Apply per-attendee, per-operation rate limits; `ListSessions` max 120/min, `GetSchedule` 60/min, reservations and favorites 30 **session IDs**/min. Respect `429 Retry-After`, cache reads appropriately, and prevent redundant refreshes from scene interactions.
- Batch favorites/reservations in sets of 1–10 distinct IDs. HTTP 200 can contain per-session failures; unknown failure codes stay refusals, not assumed success.
- A `401` triggers at most one refresh and retry. A JSON `403` means the attendee is not registered; do not relogin-loop. `409` means temporarily closed; don't retry immediately. Edge errors may be HTML or bodyless.
- For timeout/`500`/`503` after a write, reconcile with `GetSchedule` **before** considering retry; no idempotency key exists. Validate individual delete semantics against the current documentation/OpenAPI when implemented, as these descriptions may differ by operation.
- Catalog fields are optional. Track source version/last refresh, and revalidate availability when showing an action.
- Sign-in is OAuth authorization-code + PKCE, `AWSBuilderID`, scope `openid email events/access`, callback `/callback` on localhost/127.0.0.1 ports 8484–8489 with exactly matched URI. No hosted redirect URI. See [auth flow](https://docs.aws.amazon.com/events/latest/devguide/auth-signing-in.html) and [refresh](https://docs.aws.amazon.com/events/latest/devguide/auth-refreshing.html).

## 8. Approved architecture direction (model and integration details still gated)

```text
Desktop browser at localhost
   ├─ 3D scene, session cards, accessible 2D view, concierge UI
   ├─ local session/search index and deterministic planning engine
   └─ same-origin requests to loopback-only local server
         ├─ OAuth PKCE callback and ephemeral attendee token handling
         ├─ typed Events REST adapter + pagination/reconciliation/rate limits
         └─ optional AI/voice adapter (model/provider to be selected)

Separate Vercel preview: static app + labeled synthetic fixtures only
```

Approved stack: TypeScript, React, React Three Fiber/Three.js, a small Node.js server bound to loopback, typed schemas derived/checked against OpenAPI, and a conventional HTML/CSS 2D overlay. Packaging should provide one local startup command on tested Mac/Windows environments; do not promise zero runtime prerequisites until demonstrated. The hosted preview is isolated from attendee OAuth and live API writes.

AWS Bedrock is the approved AI provider, **not** an assumed model entitlement. Model, region, credential-loading UX and cost expectations remain unresolved until the AI slice; no billable request before confirmation. An AI request may receive the minimal session metadata needed for the answer, but **never the Events API access/refresh tokens**. A deterministic browsing/planning path remains available if AI is not configured.

## 9. Security, privacy, reliability, and performance

- Bind local server to loopback; reject unexpected origins/hosts, apply CSRF protection to local mutations, and never expose a token via URL, client logs, screenshots, analytics, or remote demo. Follow [AWS token handling](https://docs.aws.amazon.com/events/latest/devguide/auth-handling-tokens.html). Initial default is in-memory local-server tokens (sign in each restart); persistent OS keychain storage is a separately approved enhancement.
- Use minimal local preferences; no hosted collection of attendee schedules. State clearly if/when AI receives selected session context and where the AI request is sent.
- Make the app usable on slow devices: lazy-load the 3D scene, avoid rendering every catalog item as a mesh, reduce resolution/scene detail on weak hardware, and provide 2D/no-WebGL and reduced-motion paths. Performance budgets and reference hardware are defined during the first playable slice, then measured before adding polish.
- Ensure ordinary tasks work with keyboard and readable HTML; give canvas controls descriptions and offer equivalent non-3D actions. Voice requires microphone permission and a visible transcript, and defaults off.
- No unsourced venue routing, invented booth reservations, unsolicited schedule writes, or copied third-party 3D assets.

## 10. Sequential implementation and exit gates

| Slice | Deliverable | Exit gate before the next slice |
| --- | --- | --- |
| 0. Contract + scaffolding | Approved open decisions, API schema snapshot strategy, repo scripts, small synthetic fixtures, single local start path | Fresh clone runs sample mode; docs state what's synthetic; checks run locally |
| 1. Playable world | One original scene, 2–3 representative hubs, landmark cards, camera/overview/teleport, 2D fallback | Click/keyboard journey works; representative desktop hardware meets agreed performance budget; no unsourced real-world location claims |
| 2. Live discovery | PKCE sign-in, registered catalog pagination, GetSession/GetSchedule, search and favorite loop | Real registered account can sign in, view complete catalog, favorite and verify result; `401/403/429` behavior exercised |
| 3. Concierge + planning | Grounded text agent, explainable recommendations, conflict detection, personal-time CRUD, reservation/cancellation gated by API availability | End-to-end goal-to-proposal-to-user-approved-action-to-confirmed-state demo; partial failures and uncertain writes reconciled |
| 4. Polish + release | Wider campus, optional voice, notebook, hosted synthetic preview, README, article, video | Fresh-clone setup verified, accessibility/performance checks complete, public repo and published article ready by deadline |

Scope is sequenced for quality, not a promise that every optional feature ships. The submission must have a complete, real integration even if voice or extra scenery is deferred. Each slice is independently demonstrable and must pass its gate before expansion.

## 11. Acceptance and measurement

- A first-time developer can start sample mode using the README, identify exactly which interactions are synthetic, and run the documented verification commands.
- With a registered attendee, every catalog page is fetched until `nextToken` ends; a real session's displayed details match the returned fields, with no fabricated missing values.
- Attendee-triggered writes are confirmed against `GetSchedule`; partial success is shown per session; retries never create duplicate personal-time blocks.
- A user can find and inspect a session, make a decision, and review their itinerary **without** navigating the 3D world or enabling a microphone.
- World interactions, list, notebook, and schedule reflect the same state; 3D camera does not fetch the API on every movement.
- Article proves the four judging dimensions with a specific before/after itinerary story, original assets/credits, architecture and data-flow diagram, API surface table, test evidence, and a short demonstration.

## 12. Risks, dependencies, and explicit open decisions

| Item | Risk / consequence | Needed decision or evidence |
| --- | --- | --- |
| AI model and billing | Bedrock model calls need an approved credential, region and cost story | Bedrock approved; confirm model access and setup before the AI slice |
| Live attendee data | re:Invent catalog is gated; cannot validate with anonymous access | Participant authorizes a live read-only smoke test using their local sign-in when implementation reaches slice 2 |
| Stack | Local runtime and library versions still need verification | TypeScript/React/React Three Fiber/Node approved; validate supported versions and one-command launch in slice 0 |
| 3D assets | Original art takes time and cannot copy Jalan KL/AWS imagery | Warm miniature diorama approved; start with original procedural assets and verify rights before any external assets |
| Voice | Speech vendor, costs and latency unresolved | Optional after working text concierge; decide later |
| Expo/booths | API has no exhibitor/booth endpoint | Treat as sourced editorial zone, not real booth geometry; only add sourced data with rights |
| Mobile live mode | Phone cannot use a desktop localhost callback as its own sign-in | Responsive 2D preview only until a validated on-device auth design exists |
| Contest verification | Private rules may be updated | Review submitted rules again before publication |
| Git workspace | Parent home directory is also a Git repository | Independent app repo initialized with approval; execute Git commands inside `aws-hackathon/` and verify root before publishing |

## Sources

- Participant-supplied private contest rules (updated September 24, 2026).
- [AWS Events API overview](https://docs.aws.amazon.com/events/latest/devguide/what-is-events-api.html), [REST guide](https://docs.aws.amazon.com/events/latest/devguide/rest-api.html), [OpenAPI](https://api.awsevents.com/v1/openapi.json), [MCP guide](https://docs.aws.amazon.com/events/latest/devguide/mcp-server.html).
- [Authentication](https://docs.aws.amazon.com/events/latest/devguide/authentication.html), [sign-in](https://docs.aws.amazon.com/events/latest/devguide/auth-signing-in.html), [token safety](https://docs.aws.amazon.com/events/latest/devguide/auth-handling-tokens.html), [quota](https://docs.aws.amazon.com/events/latest/devguide/quotas.html), [errors](https://docs.aws.amazon.com/events/latest/devguide/errors.html).
- [2026 event agenda](https://aws.amazon.com/events/reinvent/agenda/), [2026 Expo zones](https://aws.amazon.com/events/reinvent/experiences/expo/), [AWS trademark guidelines](https://aws.amazon.com/trademark-guidelines/).

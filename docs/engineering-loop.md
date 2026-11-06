# Engineering harness and verification loop

Status: active process as of 29 September 2026. This is a **persistent repo protocol**, not a claim that automated build tooling exists before the app is scaffolded. `AGENTS.md` makes it discoverable to future coding sessions. Execute this loop for every change.

## Inputs and authority

1. User's latest instruction and participant-supplied private contest rules.
2. [PRD](PRD.md) and approved [decision record](decisions.md).
3. Current [build log](build-log.md), code and tests, live OpenAPI and AWS developer docs.
4. Existing repo conventions and verified local runtime behavior.

When sources conflict, do not silently rewrite facts: identify the disagreement, test only with the participant's permission if auth/data changes are involved, and record an explicit resolution. A PRD proposal never outranks a newer user instruction.

## The small-slice loop

### 0. Frame

- Inspect current slice and repo state **inside this directory**; note any unrelated changes.
- Define one user-visible outcome and list the concrete PRD IDs and API operations involved.
- Mark statements as `confirmed`, `proposed`, or `unknown`. Ask the user when an unknown changes a security boundary, cost, framework choice, account access, deployment, or UX promise.

### 1. Contract

- Read current official docs/OpenAPI for affected operations and current library docs via Context7 for affected SDK/framework APIs.
- Sketch data flow, success response, missing optional fields, auth errors, quota behavior, partial failures, and retry/reconciliation before writing code.
- Specify *observable acceptance checks* for the outcome; include both synthetic and live modes where relevant. Use live writes only after explicit consent, and never in generic CI.

### 2. Implement

- Make the smallest coherent change that demonstrates the outcome end-to-end. Favor original reusable scene elements, typed adapters, and explicit view states over speculative features.
- Separate presentation, verified catalog/schedule state, recommendation constraints, model output, and API writes. AI text is never the authoritative state.
- Add meaningful tests when they can catch failures at a boundary (e.g. pagination, PKCE state, partial results, idempotency/reconciliation, conflict checks). Do not add tests that only restate code.

### 3. Verify

- Run the narrowest relevant typecheck/lint/unit/integration/build checks implemented at that stage. Once scaffolded, document exact commands in README and run them before declaring a slice complete.
- For user-facing changes, exercise real browser interaction via Playwright, including a 2D/keyboard route and reduced-motion or no-WebGL fallback when affected.
- For API work, use synthetic contract fixtures for automated checks and a separate participant-approved manual live smoke test. Never perform reservation/cancellation/personal-time writes on a real attendee account without explicit confirmation.
- Check network and console for leaked tokens, unexpected third-party sends, errors, and redundant catalog calls. Record observed results; do not claim an unrun check passed.

### 4. Review and iterate

- Compare behavior against the acceptance checks and the **current** slice exit gate in the PRD. If a check fails, fix the cause and rerun affected checks before advancing.
- Review the diff for extra dependencies, unsourced copy, performance regressions, accessibility gaps, and changes outside this project folder.
- Update [build log](build-log.md) with evidence, blockers, and next smallest step. Update [decisions](decisions.md) only for actual decisions. Ask for approval at an unresolved gate; otherwise proceed to the next task in the slice.

## Release gates (ordered)

### Executable checks now available

- `npm run check`: TypeScript → Node boundary/contract tests → production Vite build → Chromium browser tests. Stop on first failure.
- `npm run check:clean`: temporary clean-source copy + locked `npm ci` + the complete check sequence, preserving artifacts on failure. Before public submission, additionally test a literal fresh Git clone after an authorized commit/remote exists.
- `npm run contract:snapshot`: explicit public-schema retrieval only; inspect the diff and recorded provenance before accepting an upstream change. This is not part of normal builds and does not fetch attendee data.
- App startup: `npm run dev` or `npm run build` then `npm start`; use the printed loopback URL. See README for supported/tested environment and exact boundaries.

`0 contract/scaffold` → `1 playable world` → `2 real discovery` → `3 concierge/actions` → `4 polish/submission`.

Do not silently skip ahead. An independently useful demo should remain available after every gate. The Vercel showcase is a **synthetic preview** until AWS supports the required attendee-local auth scenario in a hosted application. Submission gate includes a fresh-clone setup check, original-asset inventory, README, public repo, published Builder Center article, and a reproducible API integration demonstration.

## Working toolchain (already available in this session)

| Need | Tool / source | When to use |
| --- | --- | --- |
| AWS Events contract | Official [OpenAPI](https://api.awsevents.com/v1/openapi.json) and [docs](https://docs.aws.amazon.com/events/latest/devguide/) | Before implementing each API flow; recheck for changes |
| Current framework guidance | Context7 MCP | When choosing or using library/framework/SDK APIs |
| UI observation and regression | Playwright browser tools | Once a browser page is running, at each relevant UI gate |
| Repository/file operations | Dedicated read/glob/grep/patch tools; scoped Git and test shell commands | Per engineering loop |
| Attendee actions via AWS Events MCP | [Remote MCP](https://docs.aws.amazon.com/events/latest/devguide/mcp-server.html) | Only if explicitly chosen as an app path and user authenticates locally; REST covers the same operations |

No new MCP connection is required for the PRD. Connecting an attendee's remote MCP account or cloud project is deferred until the feature calls for it and the participant approves it.

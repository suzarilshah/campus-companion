# Project engineering contract

This file applies to all work under `aws-hackathon/`. Read [docs/PRD.md](docs/PRD.md), [docs/engineering-loop.md](docs/engineering-loop.md), and [docs/decisions.md](docs/decisions.md) before implementing a feature. At the start of a work session, read [docs/build-log.md](docs/build-log.md) for the current slice and last verified result.

## Non-negotiable working rules

1. Build **one vertical slice at a time**, in PRD order. Do not add extra scene features, voice, or deployment before the current exit gate passes; exceptions require an explicit user decision recorded in the decision log.
2. For each slice run the cycle: inspect authoritative contract → state goal and acceptance checks → implement a small change → run relevant checks → inspect actual behavior → log outcome and next step. Repeat until the slice exit gate passes. Do not mark an incomplete slice done.
3. Never invent API operations, session details, booth inventories, real-world routes, availability, or test outcomes. Distinguish sourced facts, synthetic fixtures, and proposals in code, UI, docs, and communications. Ask the participant about unresolved product/credential/asset decisions before those decisions affect code.
4. Maintain a working local-first attendee app and an explicitly synthetic hosted preview. No hosted OAuth redirect or live attendee actions on Vercel under the current AWS Events API documentation.
5. Protect attendee tokens and agency: localhost callback with PKCE/state, loopback binding, no tokens in model/tool calls, no model-triggered writes without attendee confirmation, and `GetSchedule` reconciliation after writes.
6. Keep user data and content in scope. An independent Git repository was initialized at `/Users/suzarilshah/aws-hackathon` with participant approval on 2026-09-29; its parent home directory is also a Git repository. Run Git commands from this app directory and verify the root when uncertain. Never stage, commit, delete, or reformat files outside this app. Treat `.playwright-mcp/` and `jalan-reference.png` as existing user workspace artifacts unless instructed otherwise.
7. Use primary sources for time-sensitive API, auth, SDK, and contest details. If OpenAPI and prose docs differ, record the discrepancy and verify behavior rather than silently choosing a favorable interpretation.
8. Update docs/decisions.md when a product/architecture decision is approved; update docs/build-log.md after each meaningful cycle. Change PRD requirements only with an explanation and user approval for scope-impacting changes.

## Tool routing

- AWS Events contract: [live OpenAPI](https://api.awsevents.com/v1/openapi.json) plus the [official guide](https://docs.aws.amazon.com/events/latest/devguide/). Use read-only documentation retrieval before implementing or changing operations.
- Framework/SDK docs: available Context7 MCP. Browser UI verification: available Playwright browser tools. Filesystem editing/reading: dedicated tools. Shell: run/build/test/git, scoped to this folder. Do not expose real attendee tokens or credentials to a third-party MCP server or browser recording.
- AWS Events remote MCP is a potential **attendee-authenticated product integration**, not a prerequisite for building a REST app. Configure it only when a slice needs it and the attendee explicitly approves local OAuth. Its presence does not bypass registration requirements.
- Firebase/GCP tools are unrelated to the approved architecture. Do not create cloud resources or deploy to Vercel/AWS without explicit user approval and required credentials.

## Finish condition for any code task

Report the change, commands/checks actually run and their outcomes, any blocked checks, the PRD exit criterion advanced, and the next unresolved decision. Stop and ask rather than guessing when a missing decision would change security, cost, product semantics, or architecture.

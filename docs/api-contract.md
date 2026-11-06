# API contract strategy

Product pages no longer serve sample session records (D-24). Synthetic AWS-shaped responses exist **only in automated tests** to exercise the attendee adapter; the browser shows real re:Invent sessions only after local registered-attendee sign-in. The map and its editorial place markers remain clearly illustrative. The live adapter cannot complete real catalog reads without a registered attendee's local OAuth flow.

Snapshot/update procedure (initial snapshot now stored under `contracts/`):

1. Retrieve https://api.awsevents.com/v1/openapi.json through a read-only request, validate it as OpenAPI 3.1, and store a dated snapshot plus SHA-256 and source URL under `contracts/`. Pin client generation/validation to the reviewed snapshot; do not silently regenerate during normal builds.
2. Review operations and schemas together with the official developer guide; record differences and resolve behavior with participant-approved tests. The existing removal/retry discrepancy is in `build-log.md`.
3. Normalize optional wire fields into an explicit domain type. No location or time fabrication. Test pagination, missing fields, unknown failure codes, and uncertain writes with versioned synthetic wire fixtures. Never store real attendee captures in this repo.
4. On subsequent contract updates, inspect the schema diff, update affected adapter/tests and source date deliberately. A failed refresh must not replace a known snapshot.

`contracts/provenance.json` records the actual retrieval time and hash; `tests/contract.test.ts` verifies the snapshot fingerprint and the adapter's field assumptions. Runtime normalization validates object/list structures and handles absent optional session fields. It is a deliberately small parser for the used fields, not a claim of exhaustive generated OpenAPI validation.

`Session.sessionTime` contains local `date`, `time`, duration string `length`, and optional `timezone`—not ISO UTC start/end fields. The live view preserves the returned values and says timezone is missing rather than inventing one. The current clash helper in `src/domain/planning.ts` compares listed local times **only if date and timezone labels match**; it is a hint, not verified travel-time or cross-zone scheduling. AWS's own `scheduleConflict` remains authoritative.

The schema requires session ID/title but the guide advises defensive handling of any field: a missing ID is rejected as non-actionable; a missing title displays a placeholder. `BulkResult` uses `successful` and `failed`. Unknown failure codes remain refusals. Removal-response ambiguity is resolved operationally by reading `GetSchedule`, not assuming a 404 proves a successful user action.

`/api/health` and `/api/attendee/*` are local application endpoints, not invented AWS operations. No model receives tokens. ReserveSessions and CancelReservation are implemented (D-19): bulk results are read per session; `conflictsWith` is surfaced; already-reserved IDs are not re-sent; 400/403/409/429 performed no write and return a stable local `reason`; any other failure is reconciled from GetSchedule and never re-sent. A cancel 404 is treated as already gone, but GetSchedule still decides what is shown. `/api/progress` is a local EXP endpoint, not an AWS operation. No AI or personal-time writes have been implemented yet.

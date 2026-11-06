# Map and catalog provenance

Checked on 2026-09-29. Do not confuse this illustrated exploration experience with physical navigation.

| Claim / content | Source | What is actually available |
| --- | --- | --- |
| 2026 session venue **names** (Caesars Forum, Caesars Palace, Encore, MGM Grand, The Venetian, Wynn) | [Official re:Invent 2026 agenda](https://aws.amazon.com/events/reinvent/agenda/) | Names, event-wide activities and times. No room geometries, building entrances, physical walkways or expo booth coordinates. |
| Expo zones | [Official re:Invent 2026 Expo page](https://aws.amazon.com/events/reinvent/experiences/expo/) | Descriptions of zones such as Builder Community Zone and Lightning Theaters; **not** a geocoded booth/floor-plan feed. We have not placed these zones inside any building. |
| Session location | [AWS ListSessions contract](https://docs.aws.amazon.com/events/latest/devguide/rest-op-listsessions.html) and [OpenAPI snapshot](../contracts/provenance.json) | Optional venue/room text per session, optional session date/time/timezone. No venue IDs, coordinates or routing graph. Unknown venue names should remain unmatched; no fuzzy or invented mapping. |
| Exterior venue lookup | [Google Maps URLs documentation](https://developers.google.com/maps/documentation/urls/guide) | The map page opens an external, user-initiated Google Maps *search* URL (`api=1&query=…`). This requires no Google API key and is not a route or guaranteed place match. Google content is not copied into our 3D world. |
| 3D architecture, roads, visitor and miniature coordinates | Original project procedural geometry | **Illustrative and synthetic**, not a physical map. Walking keys move only the miniature avatar. Paths are not a substitute for directions at the event. |

## Read-only AWS API probes (no attendee token)

- `GET https://api.awsevents.com/v1/events` → HTTP 200 JSON. The entry for `reinvent2026` reports `authenticationRequired: true`. Event metadata does not include booth, map or geospatial content.
- `GET https://api.awsevents.com/v1/events/reinvent2026` → HTTP 200 JSON; Las Vegas, event ID and event timezone metadata. No map/floorplan.
- `GET https://api.awsevents.com/v1/events/reinvent2026/sessions?includeAbstracts=false` → HTTP **401** JSON without attendee credentials. This is the expected protection, not a failed application installation. Never share a token just to perform an automated browser/agent probe.
- `GET https://api.awsevents.com/v1/events/Cohort-CloudHanoi-2026/sessions?includeAbstracts=false` → HTTP **200** JSON with `totalCount: 41`. A response entry demonstrates `room` text and `sessionTime.date/time/length/timezone` alongside taxonomy fields. This **public other-event catalog** is a wire-shape smoke test only; it is **not** re:Invent 2026 data and must not be represented in the app as such.

## Gate for physical wayfinding/booths

The participant confirmed **no official 2026 floor-plan/booth-coordinate dataset is currently available**. Before promising real navigation, obtain a dated source and permission to use its floorplans, entrances, accessible routes, room IDs, floors and booth IDs/coordinates; verify the data against the current event program and how changes are published. If that source remains unavailable, keep external venue searches and official venue/Expo links separate from the miniature world. Do not infer building interiors from Google Maps imagery, the Events API's room strings, or last year's event.

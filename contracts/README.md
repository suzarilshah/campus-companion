# Reviewed public API contract

`aws-events.openapi.json` is fetched from the public AWS Events OpenAPI URL, not an attendee endpoint. Its provenance record includes the fetch timestamp and SHA-256. Refresh deliberately with `npm run contract:snapshot` and review the diff before updating adapters. Never put attendee responses or tokens in this directory.

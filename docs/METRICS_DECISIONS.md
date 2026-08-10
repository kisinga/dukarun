# Metrics Decisions

| Decision           | Choice                        | Revisit when                     |
| ------------------ | ----------------------------- | -------------------------------- |
| Metrics store      | Supabase/Postgres             | Need cohorts or funnels          |
| Open tracking      | Aggregate counters            | Need event timelines             |
| Trackable links    | Dukarun secure links only     | Need arbitrary URL redirects     |
| External success   | Provider accepted             | Provider callbacks added         |
| Recipient          | One primary admin per company | Role targeting requested         |
| Scheduled audience | Resolve at dispatch           | Recipient snapshots required     |
| Scheduled edits    | Cancel and duplicate          | Editing demand proven            |
| Analytics vendor   | None                          | Reporting exceeds SQL and app UI |

## Measurement contract

- `open_count` means a valid, unexpired, non-revoked secure link returned content.
- Refreshes count again. Opens do not identify a person or prove message delivery.
- SMS and WhatsApp `sent` means provider accepted, not handset delivered.
- No IP addresses, user agents, fingerprints, cookies, or per-open event stream are stored.
- Postgres remains source of truth. External analytics may consume aggregate events later.

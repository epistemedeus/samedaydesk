# Extract contract fixtures (S77)

Synthetic envelopes for consumer interpretation of published SameDayDesk
1.23.46 extract/read/batch fields. These are not live paid responses.

Rules under test:

- `ok` means a typed paid envelope, not source usefulness
- `sourceOk` + `status` + `error` describe source HTTP outcome
- `requestedUrl` vs `finalUrl` pin redirects
- `capture` bounds (no JS, truncation, charset)
- batch `partial` / unknown source rows stay honest; no auto paid repair

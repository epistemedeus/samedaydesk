# Feature map — W4-commerce-01 job request ticket desk

| Field | Value |
| --- | --- |
| User goal | Create, inspect, and list local tickets for the six catalog useful jobs, then pick up engine outputs by `requestId` without treating SAMPLE runs as sales. |
| Entrypoint | `tools/job-request-desk/` (`bin/desk.mjs`, `lib/desk.mjs`) |
| Command | `node tools/job-request-desk/bin/desk.mjs create\|status\|list --store <dir>` |
| Test command | `node --test tools/job-request-desk/test/*.test.mjs` |
| State | `queued` / `running` / `completed` / `rejected` / `sample`; `sold` always false; live settlement out of scope |
| Identity | I01 `termsVersion` = `sha256:` + 64 hex; `requestId` is that hex; integer `termsVersion` refused |
| Persistence | Caller `--store` JSON files. No daemon. No Express mount on the live app. |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |
| Later bindings | W4-02 mailbox reads `resultUri`. W4-20 order pin may use the local HTTP adapter. F08 receipt schema is not forked. I01 earned-work HTTP/Postgres is not this module. |

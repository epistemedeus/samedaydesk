# Feature map — W5-D11 job request ticket desk

| Field | Value |
| --- | --- |
| User goal | Create, inspect, and list local tickets for the six catalog useful jobs. Rejected replay stays rejected. A clean request cannot complete with leftover catalog files. |
| Entrypoint | `tools/job-request-desk/` (`bin/desk.mjs`, `lib/desk.mjs`) |
| Command | `node tools/job-request-desk/bin/desk.mjs create\|status\|list --store <dir>` |
| Test command | `node --test tools/job-request-desk/test/*.test.mjs` |
| State | `queued` / `running` / `completed` / `rejected` / `sample`; `sold` always false; live settlement out of scope |
| Outcomes | `outcomeKind` is `delivered`, `analysis-refused`, `analysis-unchanged`, `engine-failure`, `transport-failure`, or `incomplete-outputs` |
| Identity | I01 `termsVersion` = `sha256:` + 64 hex; `requestId` is that hex; integer `termsVersion` refused |
| Execution | SDS52 wrapper CLI at pin `aeef964fa188443078958d9d6d393afae1d542ee` via `SDS52_WRAPPER_ROOT` or a git worktree. Result files go to `store/results/<requestId>/` only. |
| Persistence | Caller `--store` JSON files. No daemon. No Express mount on the live app. |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |
| Later bindings | W5-D01 may amend `server/paid-useful-jobs`. This adapter tests the pinned SDS52 head and does not claim a later D01 head. W4-02 mailbox reads `resultUri`. |

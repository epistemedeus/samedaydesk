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
| Execution | Current `samedaydesk.paid-useful-jobs.execution.v1` at `c6f1464` (useful-jobs 1.4.4 unpublished overlay). vendor-budget-impact uses the 1.0.0 wrapper archive; M01 jobs use source-identity pins. Immutable 1.4.3 `a18ab918` does not contain wrapper.mjs. Result files go to `store/results/<requestId>/` only. |
| Persistence | Caller `--store` JSON files. No daemon. No Express mount on the live app. |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |
| Later bindings | Shared runtime is read-only. HTTP execution cache is process-local. |

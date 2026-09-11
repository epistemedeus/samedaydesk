# FEATURE-MAP — result mailbox (W4-commerce-02)

| Field | Value |
| --- | --- |
| User goal | Pick up completed useful-job artifacts by requestId from a local mailbox directory, with expiry labels and digest verification. SAMPLE cannot be labelled delivered-to-buyer. |
| Entrypoint | `tools/result-mailbox/` (`bin/mailbox.mjs`, `lib/`) |
| Command | `node tools/result-mailbox/bin/mailbox.mjs seed \| pickup …` |
| State | Envelope `samedaydesk.result-mailbox.envelope.v1`; pickup `samedaydesk.result-mailbox.pickup.v1`; `sold` always false; live settlement out of scope |
| Tests | `node --test tools/result-mailbox/test/*.test.mjs` |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, HTTP mailbox, or Postgres. |

## Contract

| Topic | This module |
| --- | --- |
| Envelope schema | Owned here. Not F08 `paid-useful-jobs.receipt.v1`. |
| Engine | Spawn PR51 `node bin/useful-jobs.mjs` from the published archive. |
| termsVersion | I01 content hash `sha256:` + 64 hex. Integer rejected. Hasher pinned from Neo PR54. |
| Expiry | Labelled `--clock` vs `expiresAt`. No daemon. |
| SAMPLE | May be retrieved as `retrieved-sample`. Never `deliveredToBuyer`. |
| result-reuse | Observations only. Not a pickup path. |
| F08 / W4-01 | Later Root binding. Inject envelopes that match this schema. Do not import F08 modules. |

## Evidence classes

| Class | What |
| --- | --- |
| Fixture | SAMPLE `--example` envelope; hand-written invalid envelopes (integer termsVersion). |
| Local-runtime | Spawn useful-jobs 1.0.0 against this module's caller pricing files; pickup copies those bytes. |
| External | Not run. No live payment, hosted mailbox, or Postgres. |

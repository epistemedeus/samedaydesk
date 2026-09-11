# FEATURE-MAP — result mailbox (W5-D05 / Co02)

| Field | Value |
| --- | --- |
| User goal | Pick up completed useful-job artifacts by requestId from a local mailbox directory, with expiry labels and digest verification. Pickup is not delivery. SAMPLE cannot be labelled delivered-to-buyer. Two requests cannot retrieve each other's output. |
| Entrypoint | `tools/result-mailbox/` (`bin/mailbox.mjs`, `lib/index.mjs`) |
| Command | `node tools/result-mailbox/bin/mailbox.mjs seed \| pickup \| ack …` |
| State | Envelope `samedaydesk.result-mailbox.envelope.v1`; pickup `samedaydesk.result-mailbox.pickup.v1`; ack `samedaydesk.result-mailbox.ack.v1`; `sold` always false; live settlement out of scope |
| Tests | `node --test tools/result-mailbox/test/*.test.mjs` |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, HTTP mailbox, or Postgres. |

## Contract

| Topic | This module |
| --- | --- |
| Envelope schema | Owned here. Not F08 `paid-useful-jobs.receipt.v1`. |
| Engine | Does not spawn an engine. Seed from this tree's D01 `execution.v1` result + isolated `runOutDir`. |
| D01 result | Thin seed from this tree's `createExecutor` / `runPaidOffer`. Does not import wrapper.mjs. Useful analysis refusal with complete artifacts is retrievable; crash and missing output are not. |
| termsVersion | I01 content hash `sha256:` + 64 hex. Integer rejected. Hasher pinned from Neo PR54. Unlike F08 receipt schema; hashes not forced equal. |
| Expiry | Labelled `--clock` vs `expiresAt`. No daemon. |
| Pickup vs ack | Pickup copies verified buffers and never sets `deliveredToBuyer`. `ack` is the delivered acknowledgment. |
| SAMPLE | May be retrieved as `retrieved-sample`. Never `deliveredToBuyer`. |
| Unknown job | Catalog miss is `unknown-job`. No vendor-budget-impact output-name fallback. |
| requestId | Basename token; `.` / `..` / path separators refused; slot cannot escape mailbox root. |
| result-reuse | Observations only. Not a pickup path. |
| F08 / D01 / D06 | Receipt seed adapter here. Callback outbox stays D06. Do not import those kernels. |

## Evidence classes

| Class | What |
| --- | --- |
| Fixture | SAMPLE `--example` envelope; hand-written invalid envelopes (integer termsVersion); refused D01 receipt JSON. |
| Local-runtime | D01 execution.v1 CLI/library on this tree; mailbox seeds `runOutDir`; pickup copies those bytes; two-request CLI isolation. |
| External | Not run. No live payment, hosted mailbox, or Postgres. |

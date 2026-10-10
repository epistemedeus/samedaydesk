# RECEIPT — W5-D05 Co02 private result mailbox

Repo: `epistemedeus/samedaydesk`
Feature branch: `cursor/w5-d05-co02-private-result-mailbox-with-request-bound-pickup-1284`
Head: `38d09206a9d6d7cfb6b30dd4fc456d53ea53c266` (tests and receipt body; branch tip may be one pin commit later)
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/76
Compare: https://github.com/epistemedeus/samedaydesk/compare/main...cursor/w5-d05-co02-private-result-mailbox-with-request-bound-pickup-1284
StartingRef: `baf09dc591c83aec94e0cf42c5c64076fc5b98e3`
Owned paths: `tools/result-mailbox/`, `experiments/wave5/d05/RECEIPT.md`
Integration owner: W5-D01

## Source heads consumed (read-only)

| Ref | SHA | Use |
| --- | --- | --- |
| Co02 mailbox | `baf09dc591c83aec94e0cf42c5c64076fc5b98e3` | owned kernel |
| D01 execution.v1 | `6bed72dd22a396134aa5c957933b42c3a5746698` | CONTRACT.md + CLI `bin/cli.mjs` + library `index.mjs` (`createExecutor` / `runPaidOffer`). Worktree spawn/import only. Not vendored. |
| PR51 useful-jobs archive | this checkout | engine spawn for non-D01 seed |
| I01 hasher | `819fa637ecf5e5177c84efc16fcaa18d57017631` | already vendored |

Pilot Wave5 pin: `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`.

Mailbox `termsVersion`: `sha256:8a014f7d6db9a5a2a9010d9f7cc84e51abeac911d3c225ff7ef619a6f3a0f0c0`

## Commands and counts

```bash
node --test tools/result-mailbox/test/*.test.mjs
```

**PASS** — 21 tests, 0 fail, 0 skipped. Node v22.14.0. 5 suites. No extra npm install. Root `package.json` not edited.

Evidence classes: mailbox CLI/process; two-request D01 CLI isolation; D01 library `createExecutor` useful-refusal / crash / missing-output; local-runtime useful-jobs 1.0.0 spawn. No HTTP mailbox. No Postgres.

## Proof

- One supplied-input D01 `vendor-budget-impact` execution.v1 result is seeded, picked up, and acked. Pickup dest bytes and sha256 match `execution.outputs[]` independently of the envelope listing.
- Two requestIds (vendor-budget vs evidence-ci-annotation): pickup A has no `annotations.json`; pickup B has no `budget-impact.json`; ack A does not ack B.
- Library useful analysis `refused` with complete artifacts is retrievable (`analysis.outcome === "refused"`, `deliveredToBuyer` false on pickup). Not treated as a crash.
- Library crash is `d01-transport-not-retrievable`. Missing-output (stale caller dir) is `d01-missing-output`. Unknown job is not stored. Pickup of a failed requestId is `unknown-request`.
- aeef964-shaped receipt.v1 without `contract`/`delivery` is `invalid-d01-execution`.
- Pickup never sets `deliveredToBuyer`. `ack` is the delivered acknowledgment.

## Honestly untested

- Hosted HTTP mailbox and Postgres store (not claimed).
- Live payment / settlement (out of scope).
- D01 wrapper amendments after `6bed72dd22a396134aa5c957933b42c3a5746698`.
- Pickup of the remaining catalog jobs beyond vendor-budget-impact and evidence-ci-annotation.
- D06 callback outbox (separate owner).

## Remaining integration binding

Mailbox consumes execution.v1 at pin `6bed72dd22a396134aa5c957933b42c3a5746698` plus that run's out-dir. It does not import `wrapper.mjs` and does not vendor a competing runner. D20 can interrupt pickup vs ack using mailbox `retrieved.json` / `ack.json`. No deploy, purchase, or customer messages.

# RECEIPT — W5-D05 Co02 private result mailbox

Repo: `epistemedeus/samedaydesk`
Feature branch: `cursor/w5-d05-co02-private-result-mailbox-with-request-bound-pickup-1284`
Head: `d43e0152300f7a838c7531057f7e3aa2d91cca79` (tests and receipt body; branch tip may be one pin commit later)
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/76
Compare: https://github.com/epistemedeus/samedaydesk/compare/main...cursor/w5-d05-co02-private-result-mailbox-with-request-bound-pickup-1284
StartingRef: `baf09dc591c83aec94e0cf42c5c64076fc5b98e3`
Owned paths: `tools/result-mailbox/`, `experiments/wave5/d05/RECEIPT.md`
Integration owner: W5-D01

## Source heads consumed (read-only)

| Ref | SHA | Use |
| --- | --- | --- |
| Co02 mailbox | `baf09dc591c83aec94e0cf42c5c64076fc5b98e3` | owned kernel |
| SDS PR52 / current D01 pin | `aeef964fa188443078958d9d6d393afae1d542ee` | receipt.v1; spawned `server/paid-useful-jobs/bin/cli.mjs` from a git worktree. Not imported. |
| PR51 useful-jobs archive | this checkout | engine spawn |
| I01 hasher | `819fa637ecf5e5177c84efc16fcaa18d57017631` | already vendored |

Pilot Wave5 pin: `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`.
REVIEW-INTEGRATION Co02 reproduced: pickup is not delivery; copy/verify race; traversal requestIds; unknown-job fallback.

Mailbox `termsVersion`: `sha256:8a014f7d6db9a5a2a9010d9f7cc84e51abeac911d3c225ff7ef619a6f3a0f0c0`
D01 receipt schema `samedaydesk.paid-useful-jobs.receipt.v1` is not this hash. Unlike terms are not forced equal.

## Commands and counts

```bash
node --test tools/result-mailbox/test/*.test.mjs
```

**PASS** — 18 tests, 0 fail, 0 skipped. Node v22.14.0. 5 suites. No extra npm install. Root `package.json` not edited.

Evidence classes: CLI/process (spawn `bin/mailbox.mjs`), simultaneous two-process pickup, PR52 wrapper process, local-runtime useful-jobs 1.0.0 spawn. No HTTP mailbox. No Postgres.

## Proof

- Two requestIds with distinct artifact bytes: pickup A has only A; pickup B has only B; simultaneous CLI processes stay bound.
- Pickup sets `deliveredToBuyer: false`. `ack` writes mailbox `ack.json` with `deliveredToBuyer: true` for that requestId only.
- `--delivered` on pickup is `pickup-is-not-delivery` (SAMPLE: `sample-not-delivered`).
- Traversal `..` / `.` / `../secret` / `foo/bar` exit 2; leaked sibling files are not copied.
- Unknown `jobId` is `unknown-job`; vendor-budget filenames in the out-dir are not seeded.
- Copy uses captured buffers; mutating the source path after hash does not change dest.
- Refused D01 `engineResult.ok === false` is `d01-result-not-retrievable`, not a stored useful delivery. Missing engine inputs are engine refusal, not mailbox crash.

## pstack

Plugin cache present: `9717366/68d834d9ca8f34c375ecb8057bfbcde5396a01f8`. Skills read: tdd, prove-it-works, test-behavior, boundary-discipline, subtract-before-add, never-block, sequence-verifiable-units, figure-it-out, setup-pstack. No extra Cloud agents. Invocation is this Cursor Grok 4.6 xhigh parent; `pstack-models.mdc` was not written (would need operator role confirmation). Literal slash commands were not used.

## Honestly untested

- Hosted HTTP mailbox and Postgres store (not claimed).
- Live payment / settlement (out of scope).
- Future D01 wrapper amendments after `aeef964`.
- Pickup of the other five useful jobs (catalog names are enforced; journey seeds vendor-budget-impact).
- D06 callback outbox (separate owner).

## Remaining integration binding

W5-D01 may amend `server/paid-useful-jobs/` after PR52 `aeef964`. This mailbox consumes receipt.v1 + outDir only. D20 can interrupt pickup vs ack using mailbox `retrieved.json` / `ack.json`. No deploy, purchase, or customer messages.

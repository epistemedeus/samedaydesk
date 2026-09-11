# RECEIPT — W5-D05 / Co02 result mailbox

Repo: `epistemedeus/samedaydesk`
Feature branch: `cursor/w5-d05-co02-private-result-mailbox-with-request-bound-pickup-1284`
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/76
Head: `38d09206a9d6d7cfb6b30dd4fc456d53ea53c266`
StartingRef: `baf09dc591c83aec94e0cf42c5c64076fc5b98e3`
Owned path: `tools/result-mailbox/`
Integration owner: W5-D01

## Source heads consumed (read-only)

| Ref | SHA | Use |
| --- | --- | --- |
| SDS main / PR51 useful-jobs | this checkout | catalog + archive |
| D01 execution.v1 | `6bed72dd22a396134aa5c957933b42c3a5746698` | spawned `server/paid-useful-jobs/bin/cli.mjs` and imported `index.mjs` from a read-only worktree. Mailbox does not import `wrapper.mjs`. |
| I01 Neo PR54 hasher | `819fa637ecf5e5177c84efc16fcaa18d57017631` | already vendored |

Mailbox `termsVersion`:
`sha256:8a014f7d6db9a5a2a9010d9f7cc84e51abeac911d3c225ff7ef619a6f3a0f0c0`

D01 contract: `samedaydesk.paid-useful-jobs.execution.v1`. Nested receipt
`samedaydesk.paid-useful-jobs.receipt.v1` is not mailbox envelope terms.
aeef964 receipt.v1 without `contract`/`delivery` is rejected.

## Commands and counts

```bash
node --test tools/result-mailbox/test/*.test.mjs
```

**PASS** — 21 tests, 0 fail, 0 skipped. Node v22.14.0. 5 suites.

## Journey

Real D01 CLI `vendor-budget-impact` with mailbox caller `--before/--after`:
put, pickup, ack. Pickup dest sha256/bytes match `execution.outputs[]`
independently of mailbox envelope listing. `deliveredToBuyer` stays false
until `ack`. Unknown `requestId` is `unknown-request`.

No deploy, purchase, live payment, account change, or customer messages.

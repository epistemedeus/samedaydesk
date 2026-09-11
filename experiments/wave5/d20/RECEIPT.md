# RECEIPT — W5-D20 delivery interruption harness

Repo: `epistemedeus/samedaydesk`
Feature branch: `cursor/w5-d20-delivery-interruption-harness-across-mailbox-and-outbox-9d5b`
Assignment branch name: `codex/w5-d20-20260911`
Owned path: `experiments/wave5/d20/`
Integration owner: W5-D01
Phase: source
Draft PR: opened from this branch against `fable/f08-paid-wrappers` so the diff stays in owned paths.

## Versions tested

| Surface | Source | SHA | Interface |
| --- | --- | --- | --- |
| Mailbox Co02 / D05 pin | env worktree, PR 58 | `baf09dc591c83aec94e0cf42c5c64076fc5b98e3` | `tools/result-mailbox/bin/mailbox.mjs` |
| Outbox Co09 / D06 pin | env worktree, PR 71 | `828d8942fb1631aba92a9116dc9fbde0ee1dd258` | `tools/job-delivery-outbox/bin/outbox.mjs` |
| F08 wrapper PR52 | in-repo `server/paid-useful-jobs/` | `aeef964fa188443078958d9d6d393afae1d542ee` | `server/paid-useful-jobs/bin/cli.mjs` |

This harness does not claim D05 or D06 amended behavior. Those owners still bind the mailbox and outbox kernels.

## Command

```bash
W5_D20_MAILBOX_ROOT=/tmp/ro-worktrees/mailbox-co02 \
W5_D20_OUTBOX_ROOT=/tmp/ro-worktrees/outbox-co09 \
node --test --test-concurrency=1 experiments/wave5/d20/test/*.test.mjs
```

Without those env vars the tests attach the same SHAs as read-only git worktrees and `npm install` the outbox `pg` driver.

**PASS — 13 tests, 0 fail, 0 skip.** Node v22.14.0. PostgreSQL 16 `initdb`/`pg_ctl`. Local loopback HTTP. No live payment.

| Class | Evidence |
| --- | --- |
| Fixture | SAMPLE `--example` mailbox seed. F08 caller before/after JSON. |
| Local-runtime | F08 wrapper CLI, mailbox CLI, outbox CLI, loopback receiver, disposable Postgres 16, SIGKILL/SIGTERM child processes |
| External | Not claimed |

## Proof

Commit then lose stdout, then reopen in a new process:

- Mailbox seed writes `envelope.json`, stdout discarded, pickup copies the same `budget-impact.json` / `.md` bytes.
- Outbox enqueue writes `outbox.json`, stdout discarded, `status` stays `queued`.
- Outbox `deliver-once --attempt-ready` then SIGKILL: `deliveryState` is `unknown`, `callbackAcknowledged` is false, auto-replay is refused.
- Same unknown outcome on a real Postgres store via `--postgres`.

Pickup status is `retrieved`, not `delivered`. Envelope `deliveredToBuyer` stays false. Outbox ack is not `sold` / `sale` / `buyerAccepted`. SAMPLE `--delivered` is `analysis-refusal`. Socket-close is `transport-unknown`.

Mailbox `termsVersion` is `sha256:` + 64 hex. Outbox `termsHash` is a different 64-hex digest over `samedaydesk.job-delivery-outbox.terms.v1`. They are not forced equal. Outbox on this pin still stores integer `termsVersion` 1.

## Current-source findings (Co02/Co09 pins)

1. Co02 labels a successful non-sample pickup `deliveredToBuyer: true`. That label is not outbox callback ack and is not a sale.
2. Co02 `requestId` regex allows `.`, so `--request-id ..` joins out of the mailbox directory. A parent `envelope.json` was retrieved. Slash ids still return `invalid-request-id`. D05 remaining binding.
3. Co02 unknown `jobId` still seeds when the out-dir has vendor-budget output names. D05 remaining binding.
4. Co09 wrong path under the same loopback origin with the same event id is `event-id-body-conflict`. Non-loopback and secret query strings refuse. Terms hash binds origin, not path. D06 remaining binding.

## Remaining integration binding

W5-D01. Consume this harness against D05/D06 exports when those land. Do not treat this pin's `deliveredToBuyer` pickup field as journey completion. Do not vendor another mailbox or outbox kernel here.

pstack: marketplace plugin `9717366` cache present (poteto-mode, prove-it-works, test-behavior, idempotent ops, feature playbook). Run model `cursor-grok-4.6-xhigh`. Skills were read from cache. No extra Cloud agents. No Other-pool models, overage, or API-key substitution.

No deploy, spend, payout, or unsolicited messages.

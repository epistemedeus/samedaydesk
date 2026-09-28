# FEATURE-MAP — W5-D20 delivery interruption harness

| Field | Value |
| --- | --- |
| User goal | After a mailbox seed or outbox attempt is committed, losing the CLI response and starting a new process still shows the correct retrieval or ack state. Pickup is not callback ack. Ack is not a sale. |
| Entrypoint | `experiments/wave5/d20/` |
| Command | `node --test --test-concurrency=1 experiments/wave5/d20/test/*.test.mjs` |
| State | Consumer only. Mailbox and outbox kernels stay on their pins or in-repo D05/D06 trees. |
| Tests | `node --test --test-concurrency=1 experiments/wave5/d20/test/*.test.mjs` |
| Account prerequisite | Node >= 22, tar, local loopback HTTP. PostgreSQL 16 `initdb`/`pg_ctl` for the Postgres CLI case. No wallet or live payment. |

## Contract

| Topic | This module |
| --- | --- |
| Owned path | `experiments/wave5/d20/` only |
| Mailbox | Spawn `tools/result-mailbox/bin/mailbox.mjs` from Co02 pin `baf09dc591c83aec94e0cf42c5c64076fc5b98e3` or in-repo D05 |
| Outbox | Spawn `tools/job-delivery-outbox/bin/outbox.mjs` from Co09 pin `828d8942fb1631aba92a9116dc9fbde0ee1dd258` or in-repo D06 |
| F08 wrapper | Spawn current starting-ref CLI `aeef964fa188443078958d9d6d393afae1d542ee` |
| Lost response | Wait until the durable commit exists, SIGKILL, ignore stdout, reopen via a new process |
| Outcome classes | `retrieved`, `retrieved-sample`, `analysis-refusal`, `transport-unknown`, `queued`, `callback-acked` |
| Terms | Mailbox `termsVersion` is I01 `sha256:` + 64 hex. Outbox delivery terms are a different schema. They are not forced equal. |

## Evidence classes

| Class | What |
| --- | --- |
| Fixture | SAMPLE `--example` mailbox seed. F08 caller before/after JSON. |
| Local-runtime | F08 wrapper CLI, mailbox CLI, outbox CLI, loopback receiver, disposable Postgres 16. |
| External | Not run. No production webhook, hosted mailbox, or live settlement. |

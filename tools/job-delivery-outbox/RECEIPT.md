# RECEIPT — W4-commerce-09 crash-safe delivery outbox

**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `codex/w4-commerce-09-20260911`  
**Starting ref:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`  
**Owned path:** `tools/job-delivery-outbox/`  
**Integration owner:** Root  
**Stop:** tested isolated outbox + draft PR; no daemon or external delivery  

## What

A durable local outbox stores completed useful-job result notifications, attempts one operator-configured localhost callback, reads the ack before `delivered`, and resumes after interruption without treating an incomplete HTTP attempt as success. Default is no network. Payments stay non-settling prototypes. SAMPLE remains SAMPLE. Callback ack is not buyer acceptance or a sale.

Replaces the planner's repeat-delivery operator (overlap with commerce-03). F08 and the result mailbox still do not deliver or reconcile external callback attempts.

## Pins

| Item | Value |
| --- | --- |
| SDS main | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| F08 receipt pin (read-only) | `bae3e7cd5034b21019fb272a99d88db964b831ee` |
| useful-jobs 1.0.0 | sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 B |
| I01 terms | canonical JSON hash + `termsVersion`; engine identity `archiveSha256:archiveBytes`, not the version string |
| F08 kernel | not copied; receipt schema `samedaydesk.paid-useful-jobs.receipt.v1` only |
| cursor/plugins swarm skill | `f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d` (environment `.cursor/skills/pstack-swarm`, not in this PR) |

## Commands and counts

From the module (Node >= 22). `npm install` is required only for the optional `pg` driver used by the Postgres local-runtime test.

```bash
cd tools/job-delivery-outbox && npm install
node --test --test-concurrency=1 test/*.test.mjs
```

From the repository root:

```bash
node --test --test-concurrency=1 tools/job-delivery-outbox/test/*.test.mjs
```

**PASS — 10 tests, 0 fail, 0 skip** on this worker (`node v22`, PostgreSQL 16 `initdb`, F08 pin worktree at `/tmp/sds-f08-pin-ro`).

| Class | Evidence |
| --- | --- |
| Fixture | SAMPLE `--example` receipt; F08 caller before/after JSON from the pin |
| Local-runtime | useful-jobs CLI; two OS processes (loopback receiver + outbox CLI); disposable Postgres 16 cluster; F08 pin CLI `receipt.json` enqueue |
| External | Not claimed. No production webhook, hosted DB, or customer message |

## Caller journey

Two real local processes: enqueue a completed `vendor-budget-impact` output (useful-jobs on the F08 caller pair), `deliver-once --opt-in` to `bin/loopback-receiver.mjs`, ack, reopen `status` in a new process, one acknowledged event. `sold`/`sale`/`buyerAccepted` stay false.

## Seeded failures

1. Receiver stores the body then destroys the socket: sender records `unknown`, not failed or delivered; `deliver-once` refuses auto-replay.
2. SIGTERM after attempt persist and before HTTP response: reopen shows the same `eventId` / `termsHash`, state `unknown`.
3. Duplicate enqueue is idempotent; a body change under the same event ID is rejected.
4. SAMPLE `--example` remains `sample: true` after ack; ack is not buyer acceptance or a sale.
5. Extra refuse-closed: `sold: true`, non-loopback URL, missing `--opt-in`.

## Honestly untested

- Hosted / non-loopback webhooks
- Production payment or settlement
- Concurrent writers on one store beyond the file lock
- Crash of the disk itself (we fsync+rename; we did not pull power)
- IPv6 `::1` receiver path is allowed by the URL guard but not exercised in the two-process tests (`127.0.0.1` was)
- Sibling W4 mailbox/binder injection (recorded as later bindings, not imported)

## Next integration owner

Root. Consume this CLI/library through injected adapters. Do not wait on other W4 siblings. Do not turn this into a daemon or live webhook.

# RECEIPT — W4-commerce-09 crash-safe delivery outbox

**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `codex/w4-commerce-09-20260911`  
**Source head:** fill after commit  
**Starting ref:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`  
**Owned path:** `tools/job-delivery-outbox/`  
**Integration owner:** Root  

## What

Local durable outbox for completed useful-job result callbacks. Enqueue stores a redacted result reference. `deliver-once --opt-in` POSTs once to an operator loopback receiver. Acknowledgements are read before `delivered`. Incomplete HTTP is `unknown`, never a silent success. No daemon, production webhook, or payment.

## Pins

| Item | SHA / value |
| --- | --- |
| SDS main | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| F08 receipt pin | `bae3e7cd5034b21019fb272a99d88db964b831ee` |
| useful-jobs 1.0.0 | sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 B |
| I01 terms | canonical JSON hash + `termsVersion`; engine identity `archiveSha256:archiveBytes` (not version) |
| cursor/plugins swarm skill | `f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d` (environment only) |

## Commands

```bash
cd tools/job-delivery-outbox && npm install
node --test --test-concurrency=1 test/*.test.mjs
```

Equivalent from repo root:

```bash
node --test --test-concurrency=1 tools/job-delivery-outbox/test/*.test.mjs
```

Dependencies: Node >= 22, `tar`, published useful-jobs archive in-tree. Optional: PostgreSQL 16 `initdb`/`pg_ctl` at `/usr/lib/postgresql/16/bin` and `pg` from this module's `package.json`.

## Classification

| Class | What |
| --- | --- |
| Fixture | SAMPLE `--example` receipt; F08 caller before/after JSON copied from the pin |
| Local-runtime | useful-jobs CLI on that caller pair; two OS processes (receiver + CLI); disposable Postgres cluster when binaries exist; F08 pin worktree CLI when git worktree add succeeds |
| External | Not claimed. No production webhook, hosted DB, or customer message |

## Journey / seeded failures / untested

Filled after the test run.

## Next integration owner

Root. Later: inject result-mailbox / repeat-job-binder adapters; do not merge this as a daemon or live webhook.

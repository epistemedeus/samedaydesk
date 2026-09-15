# W4-commerce-01 RECEIPT — job request ticket desk

**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `codex/w4-commerce-01-20260911`  
**HEAD:** `399ce7fcfb069ec95cb60c1eab0a0338caaee86d`  
**Compare:** https://github.com/epistemedeus/samedaydesk/compare/main...codex/w4-commerce-01-20260911  
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51)  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/61 (draft)  
**Owned path:** `tools/job-request-desk/`  
**Integration owner:** Root

## What

Local ticket desk for catalog job ids. CLI `create|status|list` persists JSON
under `--store`. Status is `queued|running|completed|rejected|sample`.
`requestId` is the I01 content hash of job-request terms (not original F01
integer `termsVersion`). Engine spawn is the published useful-jobs 1.0.0 CLI.
`sold` is always false. No daemon, no live Express mount, no payment.

## Pins (exact)

| Item | SHA / value |
| --- | --- |
| SDS main / archive | `5b97d1b02e786acd1895cfa1508087ae3f7a1545`; useful-jobs 1.0.0 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` (2522418 B) |
| F08 caller fixtures (copied; kernel not copied) | `bae3e7cd5034b21019fb272a99d88db964b831ee` (F08 absent on main; tip `2529f1f` unused) |
| Consumer contract (packet only) | `c621646897e6fe1dccf0e5993aea63b5bc1f6bd3` |
| I01 hasher (Neo PR54) | `819fa637ecf5e5177c84efc16fcaa18d57017631`; golden `sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f` |
| cursor/plugins swarm skill (env only, not in this diff) | `f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d` |

## One caller journey

From the repository root, Node >= 22, `tar` on PATH. No network, Postgres,
wallet, or account.

```bash
STORE=$(mktemp -d)
node tools/job-request-desk/bin/desk.mjs create vendor-budget-impact \
  --before tools/job-request-desk/fixtures/caller/vendor-budget-impact/before.json \
  --after tools/job-request-desk/fixtures/caller/vendor-budget-impact/after.json \
  --store "$STORE"
node tools/job-request-desk/bin/desk.mjs status --store "$STORE" --request-id <requestId>
node tools/job-request-desk/bin/desk.mjs list --store "$STORE"
```

Status history is `queued -> running -> completed`. Outputs
`budget-impact.json` and `budget-impact.md` are listed with sha256. `sold` is
false. Re-create with the same files returns the same `requestId`.

## Tests

```bash
node --test tools/job-request-desk/test/*.test.mjs
```

**PASS** — 14 tests, 0 fail, 0 skip. Node v22.14.0. Reproducible from this PR.
No root `package.json` change.

| Kind | What ran |
| --- | --- |
| Fixture | F08 caller before/after copies; I01 golden terms; `--example` / kit SAMPLE path |
| Local-runtime | Real useful-jobs CLI from the published archive; JSON files on disk; `node:http` on `127.0.0.1` wrapping the library |
| External | None |

Seeded refusals: `--example` and SAMPLE path cannot become `completed` as a
sale; missing `--after`; unknown job id; `--request-id ../../etc/passwd`;
integer `termsVersion`; same `orderId` file swap; declared input digest mismatch.

## Honestly untested

- Real local Postgres (no `psql`/`initdb`/docker in this VM). JSON store is the
  specified product path. No fake Postgres was added.
- The other five catalog jobs through `create` (catalog bind is tested; only
  `vendor-budget-impact` was spawned).
- F08 wrapper CLI spawn / `samedaydesk.paid-useful-jobs.receipt.v1` envelope
  (F08 is absent on main; later binding).
- W4-02 mailbox pickup and W4-20 F13 order pin.
- Live payment, hosted HTTP, deploy, customer mail.

## Next

Root collects this output. Bind mailbox (02) to `resultUri` when that sibling
exists. Do not merge or deploy from this worker.

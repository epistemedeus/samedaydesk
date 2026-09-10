# S189 RESULT — record-repeat review repair (F1–F6)

Parent session: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`  
Model: `grok-4.6` · effort `xhigh`  
Branch: `codex/s189-record-repeat-review-fix-20260910`  
Head (S176 candidate, still uncommitted repair on top): `f3d55e54a7b3c548943312443f9f066652d83980`  
S185 frozen tip: `c055223` (not rewritten)

## Repro (original `f3d55e54` CLI)

Documented in `native-cells/receipts/repro-f1-f6.json`:

| ID | Observed |
| --- | --- |
| F1 | `--from-next-run` resolved `before.json` from **CWD**, not the manifest directory (`stoleFromCwd: true`) |
| F2 | `--write-next-run` pointing at `--before` **destroyed** the 404-byte pricing capture (rewrote as a manifest) |
| F3 | First `R-OPENAPI-PIN-IMPACT --write-next-run` stored `sourceMeta: null`; replay inherited stale attribution as current |
| F4 | Omitted units + equal values → `counts.unchanged: 1` (silent). Whitespace units compared as an empty unit |
| F5 | `null` manifest **threw** `TypeError: Cannot read properties of null (reading 'family')` (exit 1, empty stdout). Directory capture labeled `missing-pricing-capture` |
| F6 | Packed `INSTALL.txt` required root `npm ci` with no root lockfile; `acquisition.test.mjs` required excluded `vendor/s163-record-recipes/next-run/` |

## Fixes (existing contracts)

- F1: CLI overrides resolve against CWD; manifest-sourced paths against the manifest directory only; legacy `s163.next-run-manifest.v1` may resolve against the S163 recipe root, never CWD.
- F2: refuse output that aliases before/after/used/imported manifest (realpath + inode, including symlinks); exclusive `wx` create.
- F3: first recipe run loads `primarySource.metaFile`; current bytes get sha256/bytes with `observedAt: unknown`; mismatched replay keeps prior `sourceMeta` under `sourceMetaHistorical`.
- F4: S134 `normalizeUnit` treats blank/whitespace as missing; missing units are `unknown`/`unit-unknown`, not `unchanged` or priced `fieldChanges`. Cross-unit case (`USD/GB` vs `USD/Gb`) unchanged.
- F5: declared schemas only; family/parser mapping; `stat` size before read (`MAX_CAPTURE_BYTES=8388608`); directory → `capture-is-directory`; parser timeout 30s.
- F6: INSTALL no longer requires root `npm ci`; packed tests generate a temp manifest from packed sources; GNU tar is deterministic (`--mtime=UTC0` etc.). Discovery is **not** packed inside the tarball.

## Commands

```
npm --prefix experiments/s134-record-jobs test     # 42/42
npm --prefix experiments/s163-record-recipes test   # 6/6
npm --prefix experiments/s176-record-repeat-package test  # 26/26
```

Outside-repo unpack (INSTALL literally, no root `npm ci`):

```
tar -xzf record-repeat-job-f3d55e54a7b3.tar.gz -C /tmp
cd /tmp/record-repeat-job
node bin/record-repeat.mjs list
npm test   # 25/25 packed tests (archive-hygiene excluded from pack)
```

Four-family shared-CLI assertions: pass (OpenAPI pinned `visitorId` parameter delta; pricing same-unit 3→4 + unit-unknown orphan; CSV `id=1` one changed row + duplicate-keys-blocked; RSS description-only + HTML `non-feed-html`).

## Archive / page (generated once; rebuild equal)

| Field | Value |
| --- | --- |
| archive | `record-repeat-job-f3d55e54a7b3.tar.gz` |
| sha256 | `f4669fd20660b19fc4d7f6714b63f02cee217973fbc700484b6cc7ceb3f94eef` |
| bytes | 1253839 |
| discovery | `/discovery/record-repeat.json` → `/kit/record-repeat-job-f3d55e54a7b3.tar.gz` |
| page | `/for-agents/record-repeat` |

Second `scripts/build-archive.mjs` produced the **same** sha256. Receipt, public kit, discovery JSON, and route-shell literals match.

SPA history tests now list `/for-agents/record-repeat` next to App.tsx (S176 had the route/shell but the test catalogs omitted it).

## Native evidence

- Parent-only (no children). Peak concurrency: 1.
- Cash $0. No merge/deploy. No paid invokes.
- S185 package not rewritten.

## Remaining limit

Parser timeout is a finite `spawnSync` deadline, not a fuzz suite of hung children. Observation time stays `unknown` unless a caller/recipe digest matches — never invented from wall clock.

# H27 HA1 — durable result retrieval foundation

## Boundary repair (same session)

Root findings reproduced with known-bad controls, then fixed. No HA2 HTTP.

1. **Read-gate timeout.** Queue wait and operation lifetime now share an operation-local deadline (`createOpenDeadline` + abortable `createReadGate`). Permits transfer (`active <= cap`). Already-aborted and racing abort drop the waiter without a permit. Tests use 40ms bounds; none wait 30s.
2. **FIFO replace race.** Artifact `open` is `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`; fd is fstat'd before read. Known-bad child using blocking open is SIGKILL'd under a 1.5s parent cap and does not print `OPENED`.
3. **Spies.** Injected `forbiddenSeams` increment when called and throw. The reader never invokes them. Self-declared zero objects are not used as proof. Create-order replay still uses `wrapper.runs()` as a live engine counter.

Trusted clock: a frozen `serverNow` is one sample. After a gate wait, HA1 requires `clock()` (or `extra.clock`) re-sampled at the service boundary; otherwise `uncertain-clock`. Not request-supplied time.

Repair TAP (this VM): HA1 **39 pass / 0 fail**, H21 skeleton **10 TODO**. Regression: hygiene 3, interrupt 1, existing postgres 2.

---

## Original closeout

Native Grok Heavy (`grok-4.6`, effort `xhigh`) on Cursor Cloud. Hostname `cursor` is not provider identity. grok.com subscription only (`LOCATION=/home/ubuntu/.grok/auth.json`, logged-in true). Cash $0. `purchaseAuthority: false`. No main merge, deploy, or charge.

New parent session. Did not `--resume` H25 `da4d24f2-628a-4df5-9b51-596bfc1d6313`, H7 `01a094f5-dde1-70e1-ad54-481c90a8cd67`, H6D `01a09456-c82b-7b41-ad58-e5557da52ed3`, or Astra `01a09a0f-1261-74f0-b1b0-0e7fb0c2a86b`.

## Runtime recorded before product edits

| Item | Value |
| --- | --- |
| CWD | `/tmp/h27/wt` |
| Branch | `codex/h27-artifact-retrieval-20260913` |
| Start HEAD | `44b8ca0f01429b4d21ee38887405bec90ea77461` |
| Reviewed runtime/archive source pin | `27f0730604adf236e0f3ad818a30b5f43be6e656` |
| Public main (not edited) | `775051602d91f42ca1aa920054cfd7a451982940` |
| argv | `grok ... -m grok-4.6 --effort xhigh --cwd /tmp/h27/wt` |
| Grok CLI | 1.0.25 (`f7e67d6988e2`) |
| Node | v22.22.2 |
| PostgreSQL | 16.15 (`/usr/lib/postgresql/16/bin`) |
| TMPDIR | `/tmp/h27/runtime-tmp` |
| Flock | `/tmp/h27/runtime-tmp/test.lock` |
| Heap | `NODE_OPTIONS=--max-old-space-size=768` |
| Tests | `--test-concurrency=1` |
| Controller (does not implement product) | Cursor Cloud `bc-ec55ab26-6e23-4562-9c7a-649331bdba1f` |
| Children | none |

Root contract and H21 scaffolding were read first. No second scaffold. HA1 implements the existing `hosted-acquisition.d.ts` reader/writer on managed-order persistence.

## What HA1 owns

Managed-order acquisition modules, reservation/completion hooks, file + real Postgres metadata, private artifact bytes, and acquisition tests.

| Path | Role |
| --- | --- |
| `tools/managed-useful-jobs-order/lib/acquisition-*.mjs` | Binding, versioned hashes, clock, private bytes, reader/writer |
| `lib/create-order.mjs` | Trusted principal + server clock; admit before engine; publish verified bytes before `store.complete` |
| `lib/store-file.mjs` / `lib/store-postgres.mjs` / `sql/acquisition.sql` | Durable admission identities and tombstones |
| `test/acquisition-*.test.mjs` | File store, real PG, hostile paths, known-bad missing seam, create-order hooks |

Not edited: public archives, catalog, pages, HTTP routes, auth-provider configuration, D14, H21 skeleton TODOs.

## Tested reader/writer

`createAcquisitionService({ store, artifactRoot, maxAdmissions, maxConcurrentReads, openTimeoutMs })` returns:

- `reader.get(binding, serverNow)` → `available` or `{ state: pending \| not-found \| expired \| identity-conflict \| integrity-failed }`
- `reader.openVerified(binding & { name, sha256 }, serverNow, { signal })` → `{ metadata, bytes }` after no-follow open, same-fd fstat/read/hash, nlink=1, parent ownership, path-swap inode check
- `writer.admit(...)` at reservation (pending identity)
- `writer.publishCompleted(availableResult, verifiedFiles)` → `'created' \| 'identical'`
- `writer.expire(binding, serverNow)` removes access, then bounded byte purge; identity tombstone remains

Trusted server clock is injected (`serverNow`). Creation/expiry persist once. GET cannot extend TTL. Request-body principal/token/clock is refused. HTTP frozen-request hash and managed-order `termsHash` are stored as distinct fields unless `hashesReconciled === true`.

Injected `forbiddenSeams` spies (`runCreateOrder`, `runPaidOffer`, `settlePayment`, `deliverOnce`, `enqueue`, `acknowledge`, `engineStarts`) increment when invoked. The reader does not invoke them. That is not a self-initialized zero object.

## Commands and counts

HA1 + H21 skeleton (same `node --test` invocation so TODOs execute without nested runner):

```
TMPDIR=/tmp/h27/runtime-tmp NODE_OPTIONS=--max-old-space-size=768 \
flock /tmp/h27/runtime-tmp/test.lock node --test --test-reporter=tap --test-concurrency=1 \
  tools/managed-useful-jobs-order/test/acquisition-file.test.mjs \
  tools/managed-useful-jobs-order/test/acquisition-hostile.test.mjs \
  tools/managed-useful-jobs-order/test/acquisition-known-bad.test.mjs \
  tools/managed-useful-jobs-order/test/acquisition-hooks.test.mjs \
  tools/managed-useful-jobs-order/test/acquisition-timeout.test.mjs \
  tools/managed-useful-jobs-order/test/acquisition-postgres.test.mjs \
  experiments/codex-window/h21-package-release-gate/test/hosted-acquisition.skeleton.test.mjs
```

| Pack | Pass | Fail | Todo | Notes |
| --- | --- | --- | --- | --- |
| `acquisition-file.test.mjs` | 14 | 0 | 0 | restart, identity, expiry/tombstone, capacity, hash distinction, injected spies |
| `acquisition-hooks.test.mjs` | 3 | 0 | 0 | admit-before-engine; precommit no second engine; `wrapper.runs()` live counter |
| `acquisition-hostile.test.mjs` | 8 | 0 | 0 | names, links, path-swap, FIFO-replace race + killed known-bad child |
| `acquisition-known-bad.test.mjs` | 5 | 0 | 0 | missing seam; body principal; request clock; spy increment control; H21 TODOs |
| `acquisition-timeout.test.mjs` | 6 | 0 | 0 | 40ms queue/op deadlines; abort; cap; frozen clock after wait; clock re-sample |
| `acquisition-postgres.test.mjs` | 3 | 0 | 0 | isolated `initdb`/`pg_ctl`, unused port, teardown in `finally` |
| H21 `hosted-acquisition.skeleton.test.mjs` | 0 | 0 | **10** | still design TODOs; not HA1 passes |
| **HA1 executed assertions** | **39** | **0** | — | counted separately from the ten TODOs |
| Combined TAP | 39 | 0 | 10 | `# tests 49` `# pass 39` `# fail 0` `# todo 10` |

Regression (not counted as HA1):

| Pack | Pass | Fail |
| --- | --- | --- |
| `hygiene.test.mjs` | 3 | 0 |
| `interrupt-before-complete.test.mjs` | 1 | 0 |
| existing `postgres.test.mjs` | 2 | 0 |
| `seeded-failures.test.mjs` | 8 | 0 |

Postgres tests used owned disposable clusters (`startDisposablePostgres`, listen addresses empty, port `55000 + random(4000)`). Clients closed and `pg_ctl stop` on success and failure.

Known-bad control: process-local HTTP Map loses the record after `restart()`; durable file store recovers the same available record. Body `principalId` / `authorization` and request `clock` refuse. Frozen request hash ≠ managed-order terms hash unless explicitly reconciled.

HA2 HTTP (Range/redirects/416) and HA3 D14 second-directory consumer are **not** HA1 passes. Reader has no those methods.

## Honesty

- Public PR147 offline 1.4.7 promotion does not prove this seam.
- No live payment, catalog rewrite, or hosted deployment.
- Capacity exhaustion refuses new admission; expired tombstones keep execution IDs from reuse.
- Lost reply after `publishCompleted` recovers `'identical'`; precommit pending does not start another engine.

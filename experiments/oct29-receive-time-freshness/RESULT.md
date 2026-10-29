# H64331 result

Managed-watch freshness is classified at receipt. A body stamped during a real delayed HTTP response is no longer judged future just because the producer sampled `clock()` before the read. The same delayed transport, with the clock frozen at request start, is still `freshness_clock_ahead`.

## Clock comparison

Disposable server delay 400ms. Pinned `readMaintainedProjection` and `readPinnedSnapshot`. Archive unchanged.

| Path | requestStartedAt | source fetchedAt | observedAt | ageMs | state |
| --- | --- | --- | --- | --- | --- |
| Frozen request start | 2026-10-29T18:00:00.005Z | 2026-10-29T18:00:00.504Z | 2026-10-29T18:00:00.005Z | -499 | clock_ahead |
| Receipt clock | 2026-10-29T18:00:00.512Z | 2026-10-29T18:00:00.915Z | 2026-10-29T18:00:00.916Z | 1 | fresh |
| Future stamp, live clock | 2026-10-29T18:00:00.917Z | 2026-10-29T18:02:01.319Z | 2026-10-29T18:00:01.320Z | -119999 | clock_ahead |

Receipt `projection.observedAt` is the post-GET sample, not the source `fetchedAt`. Maximum age stayed 48h. Stale age was 176400001ms. Malformed stamps stayed `clock_unparsed`. A projection with neither timestamp stayed `clock_missing`. Partial metrics stayed `partial_metrics`. HTTP, parse, timeout, and caller abort stayed `http`, `parse`, `timeout`, and `cancelled`. Private lookup made no fetch.

## Installed path

Disposable Postgres, mounted managed-watch, owned recipient. Scheduler was not armed. `paidServiceLaunch` was false.

- First due: `baseline_established`, usefulChange false, sourceCalls 1.
- After a 61000ms lab-clock advance and a changed `marketplaceCompleted`: `content_changed`, usefulChange true, sourceCalls 2. Capture stayed `injected`, so `publicSourceChanged` stayed false.
- The changed delivery response was dropped after the recipient stored it. Readback adopted delivery `a1ca6d79e82984cb0c9e7945fac13bb741f81433736ba173c602e73977113f92` and digest `9f24891f6b4c6af4ce2a362191fe3348cbd2a776a94371fb4b7dd935458c0c16`. Recipient restart and a second POST kept that id and counted one duplicate.
- Service restart and a Postgres restart read back the same two results, the same operation id, and monitor event `8f89f5240045af1bb80758a6322f1f400263cbc340fc1c60d671c52f0307180f`. The next due was idle and made no extra HTTP call. sourceCalls stayed 2.
- Pending fetch killed after save: original fetchedAt `2026-10-29T18:01:08.349Z` was unchanged. Recovery classified at `2026-10-29T18:01:13.973Z` with no second fetch.
- Kill during the in-flight read: `unknown` / `lost_reply_no_body`, sourceCalls 1, no second fetch. The earlier delivery ids remained.

Spawned acceptance processes peaked at 316624 kB RSS.

## Commands

- `npm run test:managed-watch` exit 0. 17 tests passed. The existing public read stayed a document, and the existing scheduled public check stayed `evidence_unavailable` / `partial_metrics` / usefulChange false.
- `npm run test:receive-time-freshness` (`node experiments/oct29-receive-time-freshness/accept.mjs`) exit 0 at 2026-10-29T20:20:45.107Z.

## Preserved

Neo `d9038c21964a0a736ebb115b4718a83231d7dd42` and archive `change-monitor-0.1.0.tgz` (88319 bytes, sha256 `a5248cac86ae604b365d95e3c21da5c15cd09f1a962428eb7d60b4c3b210100f`) were not replaced. Source blob before the edit was `7186b511207eff5f30b9d9bd53b5bdc0d1c5df80`. H64319 commit `080ab75bd73bc025d3537f26bb75bdfe8343e8e6` was not resumed. Its frozen public clocks (observer 18:24:05.072Z, fetchedAt 18:24:05.179Z, age -107, `freshness_clock_ahead`, usefulDelivery false) were not relabeled. Producer `ddbd766a` remains not-dispatched. No production database, public enrollment, scheduler activation, dependency upgrade, or new monitor.

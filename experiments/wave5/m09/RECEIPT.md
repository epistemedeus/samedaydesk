# RECEIPT — W5-M09 independent page snapshots

Tool: `experiments/wave5/m09/`
Cloud branch: `cursor/w5-m09-independent-page-snapshots-with-meaningful-vs-irrelevant-change-controls-d8cf`
Root-named identity: `codex/w5-m09-20260911`
Date: 2026-09-11
Node: v22.14.0
Base: SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee`
Implementation: `a0ea65fe8a56d39aaf60d4fe633af28d62949f9e`
Engine pin tested: Co13 `91b57334818ecd7940cb854e9864f3b1749d1d1d` `tools/page-change-offline-job/` (read-only worktree; not vendored)
Compare: https://github.com/epistemedeus/samedaydesk/compare/aeef964fa188443078958d9d6d393afae1d542ee...cursor/w5-m09-independent-page-snapshots-with-meaningful-vs-irrelevant-change-controls-d8cf

## Outcome

Independent Northshore catalog page snapshots with explicit noise vs meaningful controls. Thin `bin/replay.mjs` spawns the pinned Co13 CLI. Noise stays `unchanged` or `reordered`. Title, description, and heading-text changes stay `changed`. Valid incomplete/refusal reports are analysis or gate outcomes, not crashes.

Proof: noise remains noise; significant changed content is not normalized away on in-bounds compares. Excerpt length does not erase a long-title change.

## Pins

| Item | Value |
| --- | --- |
| Write repo | epistemedeus/samedaydesk |
| Own directory | `experiments/wave5/m09/` |
| Starting SHA | `aeef964fa188443078958d9d6d393afae1d542ee` |
| Engine SHA tested | `91b57334818ecd7940cb854e9864f3b1749d1d1d` |
| Engine CLI | `node bin/page-change.mjs compare --before PATH --after PATH --fields CSV --clock ISO8601Z --out-dir DIR` |
| Report schema | `pilot/page-change-brief/v1` |
| Extract schema | `samedaydesk.extract-batch.v0` |
| Homepage / pricing / catalog | not edited |
| Payments | none |

## Evidence classes

| Class | What ran |
| --- | --- |
| fixture | 16 independent extract-batch snapshot pairs + HTML captures |
| local-runtime | Co13 child process; loopback HTTP URL refusal (0 hits) |
| postgres | probed `127.0.0.1:5432` only; no SQL public interface; not used as a store |
| external | Not run |

## Literal journey

```sh
cd experiments/wave5/m09
node bin/replay.mjs journey --out-dir /tmp/m09-journey
```

Recorded on Co13 `91b57334`: 16/16 controls matched. `meaningful-title` writes `page-change.json` / `page-change.md` with `verdict=changed`. `noise-observation-metadata` is `unchanged`. `engine.sha` in the journey body is `91b57334818ecd7940cb854e9864f3b1749d1d1d`.

## Tests

```sh
node --test --test-concurrency=1 experiments/wave5/m09/test/*.test.mjs
```

**PASS** — 30 tests, 0 fail, 0 skip on Node v22.14.0. No extra npm packages.

## Current-source findings

Reproduced against the pinned CLI, not a future M05 claim:

1. `--max-sources 1` hides a later title change (`incomplete`, semantic 0). In-bounds replay of the same pair is `changed`.
2. `--max-changes 1` omits `/title` while keeping `/description` and `verdict=changed`; `snapshot.truncated` stays false. `diffJson.truncated` uses `length > maxChanges` while visit stops at `>=`.
3. `--max-stale-ms` / default `maxJsonDepth` / `maxJsonNodes` do not bind. Freshness remains `unknown`.
4. Excerpt truncation of a 280+ character title does not normalize the change away (`verdict=changed`).

## Remaining integration binding

W5-M05 owns `tools/page-change-offline-job/`. This consumer tests `91b57334` only. Override with `PAGE_CHANGE_ENGINE_ROOT` when M05 publishes. W5-M01 selects the catalog engine. M18 is a later trial.

## pstack / model

Cursor plugin cache `9717366` at `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`. Skills read fully: `principle-prove-it-works`, `principle-test-behavior-not-implementation`, `tdd`, `principle-boundary-discipline`, `setup-pstack`. Those skills set `disable-model-invocation: true`; they were followed by reading, not slash expansion. Run model from Cursor Cloud `run-info`: `cursor-grok-4.6-xhigh`. No extra Cloud agents. `~/.cursor/rules/pstack-models.mdc` is absent here; setup-pstack was not used to write unverified slugs.

## Honesty

No deploy, purchase, live payment, default-branch push, or customer messages. SameDayDesk / EIN.LLC / Neomorphic homepages untouched.

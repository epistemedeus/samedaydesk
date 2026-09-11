# W5-D28 RECEIPT — journey release packet, readback, first return-job measurement

**Task:** W5-D28
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d28-journey-release-packet-readback-and-first-return-job-measurement-ca2f`
**HEAD:** `f240d71b40f81042a40c3d86b202f8e1ccef884b` (kit); branch tip recorded at PR110
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/110
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)
**Owned path:** `experiments/wave5/d28/`
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`

## What

Usable owner-QA kit that packs the SDS52 paid useful-jobs CLI result, reads the packed artifacts back, and measures a second job with changed caller input. Live return and deployed artifact are **absent**. No competing wrapper, Co03 binder, or Co17 verifier was copied.

## Tested implementation

| Pin | SHA / fact |
| --- | --- |
| SDS52 CLI/library | `aeef964fa188443078958d9d6d393afae1d542ee` PR52 |
| Engine archive | sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 bytes |
| Receipt schema | `samedaydesk.paid-useful-jobs.receipt.v1` |
| Kit schema | `samedaydesk.wave5.d28.journey-release.v1` |

Historical SDS52 results had no `transport` / `analysis` / `delivery` / `contract`
fields. This composition branch spawns the in-repo `execution.v1` CLI; those
fields are present on packed results.

## Remaining integration binding

| Sibling | Observed | On this branch |
| --- | --- | --- |
| W5-D01 `samedaydesk.paid-useful-jobs.execution.v1` | this tree, PR 74 | yes |
| W4-commerce-03 binder | `7c55738cc5730985b709282af6c24e10f0a8442f` PR62 | no |
| W4-commerce-17 verify-complete | `tools/job-output-atomicity/` PR 112 | yes |

## Current-source findings (SDS52 `aeef964`)

Reproduced as predicted by Pilot REVIEW-INTEGRATION / D01 receipt:

1. `inspectSample` does not treat inline JSON SAMPLE **strings** as samples; objects are detected.
2. Caller `outDir` is reused by the wrapper; this kit refuses a shared first/return directory.
3. Output SHA-256 / `outputsDigest` can move on identical input because `generatedAt` changes; `inputsDigest` and `engine.digest` stay stable. Same-input second runs are `same-input-repeat`, not a useful return.
4. Engine JSON `ok: false` is collapsed into wrapper `ok: false` without D01's delivery/analysis split.

Valid informational no-change (`status: informational`, complete artifacts) is useful delivery, not a crash.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d28/test/*.test.mjs
```

**PASS** — 18 pass, 0 fail, 0 skipped, 0 cancelled.

Real SDS52 CLI (`spawnSync` `server/paid-useful-jobs/bin/cli.mjs`), real engine archive, D28 CLI pack/readback/measure-return, and a live `serve` child on 127.0.0.1 (`/health` `/packet` `/readback` `/return` `/deployed`). Postgres is not required for this claim and was not faked.

## Field / deploy

- Deployed artifact: **absent**
- Live/independent return: **absent**
- Owner-QA second job: **present** in tests (`useful-second-job`, actionable → informational)
- `sold`: false. No spend, payout, or production deploy.

Live steps for Root: `experiments/wave5/d28/LIVE-STEPS.md`

## pstack

Plugin cache has `setup-pstack/SKILL.md` and principle skills. `~/.cursor/rules/pstack-models.mdc` is absent. Literal slash commands were not invoked. No extra Cloud/Task agents. Parent run model: Cursor Grok 4.6 xhigh (`cursor-grok-4.6-xhigh`).

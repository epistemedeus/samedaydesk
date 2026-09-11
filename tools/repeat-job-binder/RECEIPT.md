# W4-commerce-03 RECEIPT — Repeat-job binder

**Date:** 11 September 2026  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `codex/w4-commerce-03-20260911`  
**HEAD:** `4de04593f53451d03f2768b46ca1f8aca6e96964`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/62  
**Owned path:** `tools/repeat-job-binder/`

## What

A catalog-facing binder. It takes a verified `repeat-job.json` (or a next-run
manifest the engine accepts), plus new local input files whose sha256 is
declared, binds `openapi-used-ops` or `pricing-row-unit`, runs the published
useful-jobs CLI or vendor-pin record-repeat, and writes `second-run.json`.
Not a scheduler. Not W4-commerce-09. Not a sale.

PR51 archives are extracted to a temp cache. No competing kernel is copied
into this module. I01 Neo PR54 `hashTermsVersion` (`sha256:` + 64 hex) is
the terms claim; integer `termsVersion` is refused. Original F01 occupancy
kernel is not copied.

## Pins checked

| Artifact | Result |
| --- | --- |
| useful-jobs-1.0.0.tar.gz | 2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |
| record-repeat-job-ab84d79b0272.tar.gz | 1253570 B, sha256 `9814feabcda58c1f4a494a8919d9c6c2ac7d35b094ce5218261f976196c045ea` |
| catalog.json | `runtime.schedulerDaemon: false`, jobs include `repeat-job-record` |
| I01 hasher golden | `sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f` |

## Tests

```bash
cd tools/repeat-job-binder
npm test
```

**PASS** — 13 tests, 0 fail (`node --test --test-concurrency=1 test/*.test.mjs`, Node v22.14.0, ~1.7s).

No npm dependencies. Needs the committed PR51 archives in this repo. Offline.

## Caller journey (local-runtime)

1. Extract useful-jobs pin; `node bin/useful-jobs.mjs run repeat-job-record --next-run samples/repeat/a/next-run.json`
2. Copy `samples/pricing/a/{before,after}.json`, change after, declare the new sha256
3. `node bin/bind.mjs --ticket <repeat-job.json> --before … --after … --declare-after-sha256 <new> --engine catalog`
4. `second-run.json` + `engine/budget-impact.json` are distinct from the first record
5. Same inputs with `--engine vendor-pin` write `engine/record-repeat.json`

OpenAPI family covered via published `samples/repeat/caller-beta` as a fixture (not `--live-recurrence`).

## Seeded failures

| Case | Code |
| --- | --- |
| Stale digest vs new after bytes | `input-digest-mismatch` |
| SAMPLE labelled as live recurrence (forged + published caller-alpha `--live-recurrence`) | `sample-labelled-as-live-recurrence` |
| `schedulerDaemon: true` forged manifest | `scheduler-daemon-refused` |
| `--install-cron` | `cron-install-refused` |
| Integer `termsVersion` | `integer-terms-version` |
| Missing after file | informational, engine not run |

## Evidence classes

| Class | Ran |
| --- | --- |
| fixture | Forged daemon / SAMPLE-as-live / integer terms tickets; I01 golden hasher |
| local-runtime | Real useful-jobs + record-repeat CLIs on local files; local HTTP of committed `catalog.json` on `127.0.0.1` |
| external acceptance | Not claimed |

## Honestly untested

- Live `https://samedaydesk.com` acquisition (not this package; no customer messages)
- Postgres (none in this Cloud VM; binder has no SQL interface; not faked)
- W4-commerce-09 operator product (sibling absent; later binding recorded)
- csv-keyed-drift / rss-atom-brief families (out of the required pair)
- Cron on a real crontab (refused in-process; never installed)

## Hard stops

No deploy, purchase, live payment, account change, or customer messages.
Homepages, `server/pricing.js`, F08/W2/W3/H directories untouched.
`.cursor/skills/pstack-swarm` is environment-only and not in this diff.

## Next integration owner

Root. Wire W4-commerce-09 when it publishes. This binder is ready to consume
through `node bin/bind.mjs` and injected `--useful-jobs-root` / `--record-repeat-bin`.

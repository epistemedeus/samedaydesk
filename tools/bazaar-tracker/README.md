# Bazaar rematerialization tracker

One-shot CLI that reads Coinbase CDP Bazaar discovery rows for the repaired-seller
cohort, writes a **local** dated snapshot under `data/bazaar-tracker/snapshots/`
(gitignored), updates a compact source-separated per-route observation record,
and appends a human-readable changelog.

This is a script. It is not a cron job, systemd unit, or long-running daemon.

## What Git tracks

| Path | Role |
|---|---|
| `data/bazaar-tracker/observations.json` | Per-route digest: resource URL plus SHA-256 of description, accepts, and extensions. No `payTo`, amount, asset, network, or description text. |
| `data/bazaar-tracker/CHANGELOG.md` | Human-readable summary of field or digest changes |
| `data/bazaar-tracker/changelog.jsonl` | The only committed field-level history: `{ route, source, field, before, after, observedAt }` |

Full CDP payloads (`data/bazaar-tracker/snapshots/*.json`) stay on disk for local
debug and are ignored by Git.

## Cohort

Hosts in `cohort.json`:

| Seller | Hosts |
|---|---|
| GBLIN | `gblin.digital` |
| LoyalSpark | `api.loyalspark.online` |
| Palmyr | `palmyr.ai` |
| ArgonautWorks | `official-fx-reference.vercel.app` |
| AgentServices | `api.agentservices.to`, `agentservices.to` |
| The Stall | `the-stall.intuitek.ai` |
| KR-DART | `dartapi.ljaysk.com` |
| 402.com.tr | `402.com.tr` |
| Grey Ridge | `api.greyridgesignals.ai`, `x402-data-api.sigrunner.workers.dev` |
| AgentToll | `agenttoll.app`, `agenttoll.dev` |
| SameDayDesk | `agents.samedaydesk.com` |

Each seller is queried on `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/search`.
No CDP API key is required. When a search page is truncated (`partialResults`), the
tracker issues a bounded set of more specific host/path queries so every indexed
route for that host is collected. Volatile catalog fields (`lastUpdated`, `quality`)
are stored on the local snapshot and excluded from the changelog. Description
text, payment terms, and Bazaar `extensions` are hashed into the committed
per-route digest. Field-level before/after values are appended only to
`changelog.jsonl` when a previous full local snapshot exists.

## CLI

```
node tools/bazaar-tracker/cli.mjs --live
node tools/bazaar-tracker/cli.mjs --from <snapshot-or-observations.json>
node tools/bazaar-tracker/cli.mjs --fixture <cdp-search-fixture.json>
node tools/bazaar-tracker/cli.mjs --readback
```

`--from` is the synthetic / replay path: treat an edited snapshot or compact
observation as a new observation. Against a previous full local snapshot it
records field-level diffs in `changelog.jsonl`. Against a digest-only committed
observation it records digest changes only. Tests use a temporary data directory
so they never rewrite the committed baseline.

`--readback` prints the committed compact record. It does not call CDP, start a
daemon, or schedule a job.

```
npm run bazaar-tracker -- --live
npm run bazaar-tracker -- --readback
npm run test:bazaar-tracker
```

`--live` is not part of `npm run build` or the ordinary test scripts.

## How Pilot runs it (`pilot-vm-job`)

Pilot should invoke this as a single VM job that starts, writes the local snapshot
plus compact observation and changelog, and exits. Do not schedule it. Do not leave
a process running.

```
pilot-vm-job --repo epistemedeus/samedaydesk -- \
  node tools/bazaar-tracker/cli.mjs --live
```

Optional pins (still one-shot):

```
pilot-vm-job --repo epistemedeus/samedaydesk -- \
  node tools/bazaar-tracker/cli.mjs --live --pretty --data-dir data/bazaar-tracker
```

The job needs outbound HTTPS to `api.cdp.coinbase.com`. It writes only under
`data/bazaar-tracker/`. Commit `observations.json` and `CHANGELOG.md` if the
observation should stay in the repo. Do not commit `snapshots/`.

## Changelog row

Each appended JSONL object is `{ route, source, field, before, after, observedAt }`.
Added or dropped routes use `field: "resource"` with a null on the missing side.
When only the digest-only observation is present, content edits surface as
`field: "digest"`. `CHANGELOG.md` repeats the same events in readable form.

## Acceptance

1. A live or fixture run writes a local snapshot (ignored) and a URL+hash
   `observations.json`.
2. A second run against a synthetically edited snapshot reports the field diffs
   in `changelog.jsonl` (`npm run test:bazaar-tracker` covers that path without
   calling CDP).
3. `git ls-files data/bazaar-tracker` does not contain a full snapshot JSON.
4. Committed `observations.json` does not contain `payTo`, amount, asset,
   network, or description text.

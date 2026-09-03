# Bazaar rematerialization tracker

One-shot CLI that reads Coinbase CDP Bazaar discovery rows for the repaired-seller
cohort, writes a dated snapshot under `data/bazaar-tracker/snapshots/`, diffs that
snapshot against the previous file, and appends field-level changes to
`data/bazaar-tracker/changelog.jsonl`.

This is a script. It is not a cron job, systemd unit, or long-running daemon.

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
are stored on the snapshot and excluded from the changelog.

## CLI

```
node tools/bazaar-tracker/cli.mjs --live
node tools/bazaar-tracker/cli.mjs --from <snapshot.json>
node tools/bazaar-tracker/cli.mjs --fixture <cdp-search-fixture.json>
```

`--from` is the synthetic / replay path: treat an edited snapshot as a new
observation, diff it against the latest file in `--data-dir`, and append the
changelog. Tests use a temporary data directory so they never rewrite the
committed baseline.

```
npm run bazaar-tracker -- --live
npm run test:bazaar-tracker
```

`--live` is not part of `npm run build` or the ordinary test scripts.

## How Pilot runs it (`pilot-vm-job`)

Pilot should invoke this as a single VM job that starts, writes the snapshot and
changelog, and exits. Do not schedule it. Do not leave a process running.

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
`data/bazaar-tracker/`. Commit those files in a follow-up if the observation
should stay in the repo.

## Changelog row

Each appended JSONL object is `{ route, field, before, after, observedAt }`.
Added or dropped routes use `field: "resource"` with a null on the missing side.

## Acceptance

1. First live run writes `data/bazaar-tracker/snapshots/<iso>.json`.
2. A second run against a synthetically edited snapshot reports the field diffs
   (`npm run test:bazaar-tracker` covers that path without calling CDP).

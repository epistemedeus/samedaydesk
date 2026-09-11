# W5-M19 RECEIPT — maintained distribution integration

**Task:** W5-M19
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-m19-one-maintained-distribution-integration-drawn-from-current-partner-registry-events-9b79`
**HEAD:** `a76c31beb883115cf73ccff1de7d7847415f4504`
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)
**Pilot packet:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`
**Owned path:** `experiments/wave5/m19/`
**Schema:** `samedaydesk.wave5.m19.distribution.v1`

## What

One maintained distribution kit that consumes current partner/registry events
from SDS52 `tools/presence` and `registry-consumer.mjs`. The supported
contribution is MCP Registry version-only publish of
`io.github.epistemedeus/x402-data-gateway`. Bazaar/MPP writes, Grexal/generic
scans, unfiltered search-as-latest, and live publish are valid refusals. The
selected useful-jobs offer is invoked through the PR52 wrapper CLI, not a second
runner. Kernels were not copied.

## Tested versions

| Interface | Version tested |
| --- | --- |
| SDS PR52 | `aeef964fa188443078958d9d6d393afae1d542ee` |
| Presence / registry-consumer | on that SHA |
| Paid wrapper CLI | `server/paid-useful-jobs/bin/cli.mjs` on SDS52 |
| Useful-jobs catalog | `1.0.0`, archive sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |

Not claimed: W5-M12, W5-M13, W5-M01, D01 `execution.v1`.

## Commands

Node v22.14.0. No extra npm packages. Postgres unused (not a skipped store claim).

```bash
cd experiments/wave5/m19
node --test --test-concurrency=1 test/*.test.mjs
node bin/distribute.mjs journey
```

`node --test`: **22 pass, 0 fail, 0 skip, 0 cancelled**.
`node bin/distribute.mjs journey`: **ok=true**, `independentlyConsumed=false`,
`sold=false`, invoke vendor-budget-impact delivered, live settlement out of scope.

Real CLI, loopback HTTP POST `/journey` and GET `/health`, and a spawned
`bin/serve.mjs` process were executed. Missing presence/wrapper files fail
the run.

## Current-source findings (SDS52)

1. Presence fixture pack (2026-09-03) lists MCP `1.23.36` against origin OpenAPI
   `1.23.40`. Consumer capture (2026-09-09) latest is `1.23.45`. Those bodies
   and versions are unlike. They were not forced equal. Useful-jobs `1.0.0` is
   not an MCP version hash.
2. Unfiltered MCP search `servers[0]` is historical Railway `1.0.0`
   (`isLatest: false`). Treating it as current is a valid refusal
   (`unfiltered-search-not-latest`), not a crash.
3. Bazaar/MPP `--apply` is refused for protected payment fields. MCP Registry
   version-only fixture `--apply` is `sent` on the fixture fetch and is not a
   live publish (`fixture-write-not-live`).
4. SDS52 wrapper `--example` is `sample-not-a-sale`. Kit acquisition still runs
   before the wrapper try block on this SHA (D01 remaining bind). Stale
   `outDir` filtering is not claimed fixed.
5. Live public GET of `/versions/latest` on this VM returned `1.23.45`,
   `isLatest: true`, `https://agents.samedaydesk.com/mcp`. That matches the
   consumer snapshot, not the presence-submit body `1.23.40`. Listing
   acceptance of the dry-run body is not independent consume of live latest.

## Remaining live steps (Root / journey owner)

1. Do not POST `1.23.40` over live `1.23.45`. Refresh origin OpenAPI, then
   publish only if origin version is newer than listed latest.
2. Publisher JWT via existing mcp-registry login helpers. Not this worker.
3. After a real publish: GET `/versions/latest` and `search?version=latest`.
   Never use unfiltered first hit.
4. M12/M13 exports, when present, replace catalog.json / presence as capability
   and discovery pins. This kit tested SDS52 only.
5. No spend, payout, partner email, or production deploy from this assignment.

pstack: plugin cache has `setup-pstack/SKILL.md`; `~/.cursor/rules/pstack-models.mdc`
absent; slash not invoked; no extra Cloud agents. Parent model: Cursor Grok 4.6 xhigh.

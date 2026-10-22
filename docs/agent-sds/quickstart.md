# Quickstart: unpaid SDS agent loop

Goal: from a cold clone, discover SDS, route a supported job, and preview an
already-held result. You will not pay, publish, or call checkout.

Need: Node 22, repository root, no install.

The one-command check is `node docs/agent-sds/follow.mjs`. The steps below are
what it runs.

## 1. Offline cold-read (no network)

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead({preferFixture:true}), null, 2))'
```
<!-- follow-expect {"exit":0,"json":{"outcome":"offline_fixture","paid":false,"liveObserved":false}} -->

Expect `outcome: "offline_fixture"`, `paid: false`, `liveObserved: false`.
Coverage is `partial_discovery_not_apex_guide`. Alternate catalogs are not the
apex `/for-agents` job guide. A later purchase is not a recovery step.

## 2. Route a free-discovery job

```bash
node tools/offer-routing/route-job.mjs docs/agent-sds/fixtures/free-discovery.job.json
```
<!-- follow-expect {"exit":0,"json":{"ok":true,"paid":false,"executionAuthorized":false,"selected.offerId":"sdd.cold_read_discovery"}} -->

Expect `ok: true`, `selected.offerId: "sdd.cold_read_discovery"`, `paid: false`,
`executionAuthorized: false`. Routing is advice. It does not fetch or pay.

## 3. Route a page-change job

```bash
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/page-change-evidence.job.json
```
<!-- follow-expect {"exit":0,"json":{"ok":true,"paid":false,"executionAuthorized":false,"selected.offerId":"sdd.page_change_offline"}} -->

Expect `selected.offerId: "sdd.page_change_offline"`. That offer compares two
already-held extract-batch JSON snapshots. It does not buy a second observation.

## 4. Preview result reuse (no write)

```bash
NOW=2026-09-17T00:00:00.000Z
node tools/result-reuse/cli.mjs preview --input tools/result-reuse/fixtures/accepted-page-change.json --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW"
```
<!-- follow-expect {"exit":0,"json":{"ok":true,"mode":"preview","optInRequiredToWrite":true,"purchaseRequiresPublish":false,"publicSafeCertified":false}} -->

Expect `mode: "preview"`, `optInRequiredToWrite: true`,
`purchaseRequiresPublish: false`. Preview does not write a file. Export is a
separate how-to and still requires `--opt-in`.

## Stop

You now have an unpaid discovery outcome, two route decisions, and a reuse
preview. Next: [howto/discover.md](howto/discover.md) for live-vs-fixture,
[howto/route-a-job.md](howto/route-a-job.md) for unsupported jobs, or
[howto/refuse-wrong-path.md](howto/refuse-wrong-path.md) before touching any
URL that is not in this set.

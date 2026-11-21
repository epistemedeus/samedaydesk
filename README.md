# SameDayDesk (public entry)

Public helpers for **free discovery** and **offline result reuse**. Node **22.x**. The commands below use plain ESM under `tools/`; no `npm install` is required.

Start with the examples below, then open the helper documentation for options and error handling.

## Docs (in-repo)

| Doc | Purpose |
| --- | --- |
| [tools/presence/FOR-AGENTS-COLD-READ.md](tools/presence/FOR-AGENTS-COLD-READ.md) | Free discovery when apex TLS/connect fails |
| [tools/presence/REGISTRY-CONSUMER.md](tools/presence/REGISTRY-CONSUMER.md) | MCP Registry `version=latest` pitfall |
| [tools/result-reuse/README.md](tools/result-reuse/README.md) | Offline source → task-memory observation |
| [tools/offer-routing/README.md](tools/offer-routing/README.md) | Task → existing SameDayDesk/Neomorphic offer |
| [tools/offer-routing/capability-limits-matrix.json](tools/offer-routing/capability-limits-matrix.json) | Machine-readable capability/limits matrix |

Current paid-dependency state: `https://samedaydesk.com/discovery/paid-gateway.json`.
The paid gateway is paused. Its canonical catalogs are identity references during
the pause. Free apex tools and hosted offline archives remain separate; acquired
packages still run locally. Cold-read fixtures are historical examples.

## Free / live vs offline fixtures

| Mode | Network | Payment | How |
| --- | --- | --- | --- |
| Offline fixture cold-read | none | none | `preferFixture: true` → `outcome: "offline_fixture"` |
| Live cold-read | free HTTP only | none | default resolve → often `alternate_live` when apex fails |
| Result-reuse preview/export | none (local JSON) | none | fixtures + `--opt-in` to write |

These helpers do not require a purchase. Paid extract/batch routes are separate.

## Exact commands (clean checkout)

From the repository root (no install):

### 1. Offline cold-read (no network)

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead({preferFixture:true}), null, 2))'
```

Expected: `outcome: "offline_fixture"`, `paid: false`, `liveObserved: false`.

### 2. Live cold-read (free HTTP only; optional)

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead(), null, 2))'
```

Expected when apex transport fails but agents.* respond: `outcome: "alternate_live"`, `paid: false`.

### 3. Result-reuse preview and export on in-repo fixtures

```bash
PILOT_EXAMPLE_DIR="$(mktemp -d)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node tools/result-reuse/cli.mjs preview \
  --input tools/result-reuse/fixtures/accepted-page-change.json \
  --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW"

node tools/result-reuse/cli.mjs export \
  --input tools/result-reuse/fixtures/accepted-page-change.json \
  --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW" \
  --opt-in --out "$PILOT_EXAMPLE_DIR/reuse-observation.json"
printf 'Saved example in %s\n' "$PILOT_EXAMPLE_DIR"
```

Record-kind fixture:

```bash
PILOT_EXAMPLE_DIR="$(mktemp -d)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node tools/result-reuse/cli.mjs export \
  --input tools/result-reuse/fixtures/accepted-record-report.json \
  --task-id vendor-watch --subject record-export --sequence 1 --clock "$NOW" \
  --opt-in --out "$PILOT_EXAMPLE_DIR/reuse-record-observation.json"
printf 'Saved example in %s\n' "$PILOT_EXAMPLE_DIR"
```

Expected written observation: `schema: "neomorphic.task-memory.observation.v1"`; export requires `--opt-in` plus caller clock/task/subject/sequence.


## Task → existing offer (cold selection)

When the job is known, route with the matrix before paying or treating a sample as live:

```bash
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/complete-issue-discussion.job.json
```

Expected: `ok: false`, `selected: null`, exit code 2 and
`complete_issue_acquisition_unavailable`. Neither paid `/extract` nor task-kit
packaging acquires a complete discussion. This matrix does not advertise the
pending issue-evidence acquisition pack. For historical fixture composition use
`fixtures/supplied-issue-brief.job.json` under `tools/offer-routing/`.
The MoltJobs SDK pack runs a disposable local HTTP rehearsal; its shipped runner
refuses `--live`, even with credentials. Hosted archives are downloads, not hosted
job execution. Routing does not evaluate acceptance criteria or authorize payment.

## Verify the cited examples

```bash
npm run test:public-entry
```

That script runs the offline cold-read and fixture export commands cited above (no network, no payment). Existing focused suites: `npm run test:presence`, `npm run test:result-reuse`, `npm run test:offer-routing`.

## Received gateway availability and managed release

`server/config/paid-gateway-availability.json` owns this external dependency's
received state. It does not replace package identity, launch history or retained
entitlements. `available`, `paused` and `unknown` project deterministically into
the guide/status file and apex skill, OpenAPI, catalog and agent card. Invalid or
missing input projects as unknown and cannot advertise a callable paid job.
The task-to-offer router reads the same state before selecting paid extraction;
the matrix's hosting field describes the delivery type, not current uptime.

After actual configured-runtime recovery, Root supplies a received state JSON:
`state`, ISO `observedAt`, and `received` containing the same `observedAt`, exact
40-character `sourceCommit`, `deploymentId`, non-secret `receipt` reference, and
true `configuredRuntime`, `freshAuthority`, `oldAuthorityRefused`, `retainedState`
and `sharedConsumers`. The receiver must establish these facts on the actual
configured deployment after the pause, using the existing incident recovery
workflow. A source merge, old healthy image or elapsed time is insufficient.
The receipt reference contains no credential, private handle or financial row.
The update command validates this supplied receiving; it does not perform it.

```sh
NODE_OPTIONS=--max-old-space-size=1280 node server/scripts/project-gateway-availability.js --receive /absolute/received-gateway-state.json
NODE_OPTIONS=--max-old-space-size=1280 npm --prefix client run build
NODE_OPTIONS=--max-old-space-size=1280 node --test --test-concurrency=1 server/scripts/test-gateway-availability.js server/scripts/test-machine-guide-links.js server/scripts/test-machine-discovery-journey.js
```

To regenerate the current machine projection, omit `--receive`. To pause again,
receive `{"state":"paused","observedAt":"<new ISO timestamp>"}`. Tests pin the
admitted paused state; update that expected release state when receiving an
authorized restoration, preserving the paused fixture and failure controls.

Root then uses Pilot OPERATOR-RUNBOOK's existing parameterized machine-only
managed release, controller `7c798f18c9f385b51139bcf4f03b1458dc928c56`, a fresh
operation/current activated baseline, and the managed source lineage
`codex/root1434-native-response-completion-20261020`. Canonical source staging:

```sh
node tools/ops/hostinger-contributor-qualification-cli.mjs \
  --phase source --step stage --manifest "$MANIFEST" \
  --sds-root "$NEW_ISSUER" --source-checkout "$SDS_GIT" \
  --reuse-source "$RECEIVED_HOST_SOURCE" --dependencies-root "$DEPENDENCIES_ROOT" \
  --entry-closure true
```

Run that command from the pinned Pilot controller checkout with actual received
inputs. Continue the same owning release's qualification/activation, preserving
wallet/admin/issuer bytes. Receive unchanged emitted human HTML/assets, exact
new source/build, private health, public guide, status JSON and apex declarations.
No migration, payment, enrollment or Railway restart follows this source repair.
A pushed source branch is not installed availability.


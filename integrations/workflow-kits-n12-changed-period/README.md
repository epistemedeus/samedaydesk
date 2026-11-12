# SameDayDesk workflow kit: changed later period (n12)

An importable Make scenario and n8n workflow, plus a client endpoint, for rerunning a
recurring record-to-accepted-output period whose workflow output schema has changed.
Each record is mapped with a declared, versioned mapping, run through the Useful
Commerce recurring journey, and applied downstream at most once.

This package sits beside `integrations/workflow-kits-n12/` and does not change it. It
has its own package, its own vendored copy of the Useful Commerce journey, and no
runtime dependency outside this folder.

Status: source, fixtures and a local simulation. Neither artifact in this package has
been imported into Make or n8n. Their provider import is unsupported and unreceived;
see `OBSERVATIONS.md`. No buyer, payment, paid execution or live run is claimed.

## What a fresh operator or agent gets

1. Import `n8n/changed-period.workflow.json` or `make/changed-period.blueprint.json`.
   Both have a webhook trigger only, no credentials, no schedule, and are inactive.
2. Point the kit at your client endpoint (n8n: the `Kit Settings` node; Make: the URL
   of the four HTTP modules). The shipped value is
   `https://client.example.invalid/samedaydesk/workflow-kits-changed-period`.
3. Post each period to the webhook: `{ period, records }`, as in
   `fixtures/period-n.request.json`.
4. When a later period's output schema changes, add a new `mappingVersion` to
   `config/mapping-registry.json`, validate it, paste the registry into the
   `Period Mappings` node (n8n) or module (Make), and set `period.mappingVersion`.
5. Rerun the period. Records that were already applied report `already_applied` and
   are not applied again. Every exception says what to do next.

## Contents

| Path | What it is |
| --- | --- |
| `n8n/changed-period.workflow.json` | n8n workflow, 15 nodes: Webhook, Set, HTTP Request, If, Respond to Webhook, Split Out, Wait. |
| `make/changed-period.blueprint.json` | Make scenario blueprint, 15 modules: custom webhook, Set variable, JSON, HTTP, routers, iterator, sleep, webhook response. |
| `config/mapping-registry.json` | Declared mappings `workflow-output.v1` (period N) and `workflow-output.v2` (period N+1). |
| `src/mapping.mjs` | Registry validator and deterministic record mapper. |
| `src/client-endpoint.mjs` | The three routes both recipes call: `/evaluate`, `/apply`, `/replay`. |
| `src/ledger.mjs` | Apply receipts keyed by journey idempotency key plus record key. |
| `src/exceptions.mjs` | Exception shape and suggested actions. |
| `src/simulate.mjs` | Interpreters that execute the committed n8n and Make graphs against the endpoint. |
| `src/direct-route.mjs` | Direct control: the same recipe as plain code. |
| `src/native-control.mjs` | Native control: the vendored journey on its own fixtures, no mapping. |
| `src/scenario.mjs` | The 7-step changed-period scenario used by tests and `EFFORT.json`. |
| `fixtures/` | Synthetic period requests and the injected faults. |
| `vendor/` | Unchanged copies of the Useful Commerce journey, job contract and request contract, listed with sha256 in `vendor/PINS.json`. |
| `EFFORT.json` | Mapping, adaptation and review effort per route, plus the simulation results. |
| `OBSERVATIONS.json`, `OBSERVATIONS.md` | Actual-provider observations kept apart from fixture results. |
| `bin/workflow-kits-n12-changed-period.mjs` | Command line: `hashes`, `paths`, `validate [file]`, `simulate <make|n8n|direct>`, `native`. |
| `install-check/` | Cold-consumer install test (`npm run test:install`); not shipped in the tarball. |
| `VM-RUN.md` | Exact commands for the VM run. |

## Install

Node 20 or later (tested on Node 22). Zero runtime dependencies. Build the tarball
from this folder and install it into your project; no registry access is needed:

```sh
cd integrations/workflow-kits-n12-changed-period
npm pack          # writes samedaydesk-workflow-kits-n12-changed-period-0.1.0.tgz
cd /path/to/your-project
npm install --no-audit --no-fund /path/to/samedaydesk-workflow-kits-n12-changed-period-0.1.0.tgz
npx workflow-kits-n12-changed-period hashes
npx workflow-kits-n12-changed-period validate
```

Import from the package entry only:

```js
import {
  createChangedPeriodEndpoint, validateMappingRegistry, mapRecord,
  simulateN8n, simulateMake, runScenario, artifactDigests, kitPath,
} from "@samedaydesk/workflow-kits-n12-changed-period";
```

## The recipe

Both artifacts do the same thing:

1. Receive `{ period, records }` on the webhook.
2. Post `period`, `records` and the embedded mapping registry to `/evaluate`.
3. If the registry or request is invalid, answer 422 with `configErrors`. Nothing is
   evaluated or applied.
4. Otherwise answer 200 with the evaluation, then handle each record:
   - `ready`: post to `/apply` with `Idempotency-Key: <ledgerKey>`.
   - retryable with a replay key (`uncommitted`): wait, post to `/replay` with the
     same idempotency key, and apply if it comes back `ready`.
   - `already_applied` or any other exception: nothing more; the evaluation already
     told the caller.

`/evaluate` maps each record with `period.mappingVersion`, then calls the vendored
journey (`runRecordToAcceptedOutput`, or `replayLaterPeriod` when the record was
accepted in `period.priorPeriodId`). It returns the journey's frozen `period`
interface per record unchanged, plus `outcome`, `ledgerKey` and `exception`.

### Declared mapping, never guessed

A mapping entry lists every source field path and type. A record with an undeclared
field, a missing field, a changed type, or an enum value the mapping does not list is
`schema_changed` with the exact field path. The kit never guesses a rename. Targets
fill the permitted capture (`captureId`, `capturedAt`, `subject`, `sourceUri`,
`permitted`) and its payload (`title`, `status`, `output`). The journey then derives
`period.recordEvidence`. `termsVersion` always comes from the exchange preview or
readAccepted result in `period.termsInput`; the kit never hashes terms.

Period N+1 in the fixtures changes the schema materially: `captureRef` and
`capturedAt` move under `capture`, `heading` becomes `title`, `state` (string) becomes
`done` (boolean), `keys` becomes `outputKeys` (the same rename as the journey's own
schema-change fixture), `consent` changes from boolean to `"yes"`/`"no"`, `notes` is
removed and `priority` is added. `workflow-output.v2` declares all of it.

### Rerun without double-apply

Apply receipts are keyed by `<idempotencyKey>:<recordKey>`, where the idempotency key
is the journey's request digest. They are write-once:

- the same accepted record evaluated again is `already_applied`, with the original
  receipt;
- a second `/apply` for the same key returns `duplicate: true` and applies nothing;
- the same record in the same period under a different digest is
  `record_already_applied` (same terms) or `terms_changed` (different terms).

Receipts are not an acceptance store. Acceptance and its replay stay with the
journey's effect projection, keyed by the same request digest.

### Old accepted terms preserved

Each receipt keeps the `termsVersion` it was accepted under. A later period under new
exchange terms gets new receipts; earlier receipts keep their terms. Rerunning an
already applied period under different terms is `terms_changed` before the journey
runs, so nothing is committed or applied. A locally hashed `claimedTermsVersion` that
differs from the exchange value is `terms_changed` from the journey itself.

### Exception output

Every exception has `code`, `source` (`journey`, `mapping`, `ledger` or `kit`),
`message`, `recordKey`, `fieldPath`, `fields`, `retryable`, `sameIdempotencyKey` and
`suggestedAction`. `retryable` for journey codes is the journey's own
`period.retry.retryable`. Example:

```json
{
  "code": "capture_stale",
  "source": "journey",
  "recordKey": "r-004",
  "fieldPath": "records[3].capture.at",
  "retryable": true,
  "sameIdempotencyKey": null,
  "suggestedAction": "Nothing was applied for this record. Rerun the period with a fresh capture inside the horizon."
}
```

## Simulation and controls

`src/simulate.mjs` executes the committed graphs: n8n in `executionOrder` v1 (one
branch finished before the next, top branch first), Make bundle by bundle through the
routers and the iterator. A failing HTTP call stops the run, as a failing node or
module would. The scenario (`src/scenario.mjs`) runs 7 steps on each route against a
fresh endpoint with one uncommitted first request and one lost apply reply injected:

| Step | What happens |
| --- | --- |
| period-N | 3 records applied under mapping v1 |
| period-N+1 unadapted | v2 rows with mapping v1: 5 `schema_changed`, nothing applied |
| period-N+1 attempt | mapping v2: uncommitted r-002, lost reply on r-003, stale r-004, not permitted r-005; the run stops at the lost reply |
| period-N+1 rerun | fresh r-004; already applied records are skipped |
| period-N+1 rerun again | nothing new applied |
| period-N under changed terms | `terms_changed` for all 3, nothing applied |
| period-N+1 local hash | `terms_changed` for all 5 |

All three routes end with the same 7 receipts and at most 1 apply per key. The
partial attempt differs by engine: Make and direct apply r-001, r-002 and r-003
before stopping; n8n finishes the apply branch first, stops at r-003, and applies
r-002 on the rerun.

The native control runs the vendored journey on its own fixtures: period N accepted,
a lost reply recovered with no second effect, a changed output accepted as
`useful_change`, and the `output` to `outputKeys` rename refused as `schema_changed`
with no adaptation.

## Effort (from EFFORT.json)

| Route | Mapping targets | Wiring refs | Registry field edits | Artifact edits | Request edits | Review items | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Make | 18 | 28 | 21 | 1 | 1 | 17 | 86 |
| n8n | 18 | 25 | 21 | 1 | 1 | 17 | 83 |
| direct | 18 | 21 | 21 | 0 | 1 | 17 | 78 |
| native | 0 (3 agreed fields fixed in the journey) | n/a | unsupported | unsupported | n/a | 1 | not summed |

Definitions and sources are in `EFFORT.json`. Native cannot adapt to the renamed
field, so its adaptation is unsupported, not zero. The native step count (4) and its
agreed fields are cited from the vendored journey source at the pins below.

## Useful Commerce pins

The journey runtime belongs to Useful Commerce and is vendored unchanged
(`vendor/PINS.json`, verify with `node scripts/vendor-sync.mjs --check`):

| PR | Head | Consumed |
| --- | --- | --- |
| 682 | `fb8228a90a3f12221451ab27a3c9dc9eccc5ab6e` | job contract and request contract (request digest is the idempotency key) |
| 684 | `175245e38f86431dcdfcf6607580e3af0b999d68` | recurring journey and frozen period interface (via 689) |
| 687 | `0230cda1743a25840b808573b7be3a4b11d42b9a` | quote continuity and comparison rows (via 689) |
| 689 | `f04125452e8e75d4f6aa7932bb013709d4f4d53e` | owed reference binding; the vendored recurring-journey folder is taken at this head |

## Limits

- Duplicate protection lives at the client endpoint (apply receipts and the journey
  request digest), not in Make or n8n. A platform retry that bypasses the endpoint is
  not deduplicated.
- The simulators model only the node and module types these artifacts use and refuse
  anything else. They are not Make or n8n.
- No provider import of these artifacts has happened. See `OBSERVATIONS.md`.

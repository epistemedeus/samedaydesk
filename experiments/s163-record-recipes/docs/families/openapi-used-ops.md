# OpenAPI used-ops family

Family `openapi-used-ops` is the S163 recipe wrapper around the pinned S134 parser
`s134-openapi-impact` (`experiments/s134-record-jobs/modules/openapi-impact/cli.mjs`
at commit `65ce1867f1b4339cc708bfb72a7d9a5942785632`). S163 prepares a **used-operation
pin**, runs **scoped** before/after impact on already-captured OpenAPI documents, and
emits a **next-run manifest**. It does not reimplement the parser.

Cash **$0**. Offline local files only. No URL fetch, no remote `$ref` resolve, no
LLM, no notifications.

| Recipe | Role |
|---|---|
| `R-OPENAPI-PIN-IMPACT` | Pin buyer-used operations; run scoped impact on the museum pair |
| `R-OPENAPI-NEXT-RUN` | Build `s163.next-run-manifest.v1` from that pin + last report (depends on the pin recipe) |

Primary source: Redocly Museum OpenAPI (`sources/openapi/museum/`, MIT). See
`SOURCE.json`. Not synthetic.

---

## How `R-OPENAPI-PIN-IMPACT` pins used operations

The pin is a local JSON list, not the whole document. Adapter
`adapters/openapi-used-ops.mjs#loadUsedOpsPin` requires `operations` to be a
non-empty array. Each entry must be **method + path** or **operationId**. Empty or
malformed pins are **refused** (`empty-used-ops-pin` / `invalid-used-op`); the
adapter does not invent operations.

Museum pin `sources/openapi/museum/used-ops.pin.json` (five path operations):

| method | path |
|---|---|
| GET | `/museum-hours` |
| GET | `/special-events/{eventId}` |
| PATCH | `/special-events/{eventId}` |
| DELETE | `/special-events/{eventId}` |
| GET | `/tickets/{ticketId}/qr` |

Unpinned on the same documents (out of scope for impact):

- Path ops `POST /special-events` and `POST /tickets`
- OpenAPI 3.1 `webhooks` (museum: `publishNewEvent`)
- `info`, `servers`, and `components` except where a pinned op’s fingerprint
  actually uses them

S134 compares **only** operations resolved from `--used`. Report field
`scope` is `used-operations-only`. `usedOperationCount` is the size of the
resolved pin (5 here).

Recipe subjobs:

1. Pin a buyer-relevant used-ops list (method+path).
2. Run scoped impact — webhook/component edits outside the pin must not invent used-op churn.
3. Record observed no-change on pinned ops when that is what the pair shows.

Expected fixture `fixtures/expected/openapi-museum-used.json`:
`impact.changed = 0`, `impact.unchanged = 5`, `ok: true`.

---

## Why scoped no-change can be correct when webhooks change outside the pin

`s134-openapi-impact` indexes **`paths`**. OpenAPI 3.1 **`webhooks`** are a
separate document object. A webhook add, edit, or remove never appears as
used-operation `added` / `removed` / `changed` unless that same method+path is
also listed in the pin (museum webhooks are not).

So a **document-level** diff can be non-empty while **pinned** impact is
unchanged. That is scoped no-change, not a false negative on the whole file.

The museum pair is that case:

- `SOURCE.json`: `contentIdentical: false` (before commit `56d2e8f64…`, after
  `2770b2b2e…`, path `openapi.yaml`).
- Captured YAML also differs in `info.version` (`1.2.0` → `1.2.1`) and a
  `components.schemas.Ticket` description. `Ticket` is not fingerprinted by the
  five pinned ops (`GET /tickets/{ticketId}/qr` uses `TicketCodeImage`).
- Both captures already contain `webhooks.publishNewEvent`. The recipe still
  treats webhook/component edits **outside the pin** as out of scope: if a later
  pair added or changed that webhook, `impact.unchanged = 5` on this pin would
  remain the correct scoped claim.

Coverage note retained into the next-run manifest:

> Webhook/component changes outside pinned used ops are out of scope for
> `impact.unchanged` claims.

Do **not** read `impact.unchanged = 5` as “the OpenAPI document did not change.”

---

## How `R-OPENAPI-NEXT-RUN` builds a next-run manifest

Depends on `R-OPENAPI-PIN-IMPACT`. Adapter:
`adapters/openapi-used-ops.mjs#buildNextRunManifest`. Demo:
`demos/openapi-used-ops.mjs` writes `next-run/R-OPENAPI-PIN-IMPACT.manifest.json`.

The function does not fetch remotes and does not expand the pin. It copies the
same `before` / `after` / `used` paths, attaches `sourceMeta` (commits, license,
`sourceUrl`), and records coverage:

```json
{
  "schema": "s163.next-run-manifest.v1",
  "recipeId": "R-OPENAPI-PIN-IMPACT",
  "parser": "s134-openapi-impact",
  "inputs": {
    "before": "sources/openapi/museum/before.yaml",
    "after": "sources/openapi/museum/after.yaml",
    "used": "sources/openapi/museum/used-ops.pin.json"
  },
  "coverage": {
    "scope": "used-operations-only",
    "usedOperationCount": 5,
    "note": "Webhook/component changes outside pinned used ops are out of scope for impact.unchanged claims."
  },
  "retain": ["units", "coverage", "sourceUrl", "commit", "license"],
  "paidValueClaim": false
}
```

`usedOperationCount` comes from the last parser report when present. A later
run must reuse `inputs.used` as-is. Silently adding unpinned operations would
change the claim from scoped impact to whole-document impact.

---

## Literal CLI (cwd = `experiments/s163-record-recipes`)

Do not copy parser source. Call the pinned module:

```bash
node ../s134-record-jobs/modules/openapi-impact/cli.mjs \
  --before sources/openapi/museum/before.yaml \
  --after sources/openapi/museum/after.yaml \
  --used sources/openapi/museum/used-ops.pin.json
```

Same argv is stored on the recipe as `cliExample` and built by
`adapters/openapi-used-ops.mjs#buildOpenApiCliArgs`.

Family demo (pin check + CLI + manifest write):

```bash
node demos/openapi-used-ops.mjs
```

---

## Import (compare helper is exported)

The S134 CLI module exports `compareOpenApiImpact`. Import that helper; do not
vendor a second parser. Runnable sample:
[`docs/consumers/openapi-import-snippet.mjs`](../consumers/openapi-import-snippet.mjs).

From this package root:

```js
import fs from 'node:fs';
import { compareOpenApiImpact } from '../s134-record-jobs/modules/openapi-impact/cli.mjs';

const report = compareOpenApiImpact({
  beforeText: fs.readFileSync('sources/openapi/museum/before.yaml', 'utf8'),
  afterText: fs.readFileSync('sources/openapi/museum/after.yaml', 'utf8'),
  usedSpec: JSON.parse(fs.readFileSync('sources/openapi/museum/used-ops.pin.json', 'utf8')),
});
```

If an operator cannot import the module, spawn the literal CLI above and parse
stdout JSON (`report.impact`, `report.usedOperationCount`). The sample file
documents that spawn in a comment.

Next-run construction stays in S163:

```js
import { loadUsedOpsPin, buildNextRunManifest } from './adapters/openapi-used-ops.mjs';
```

---

## Non-claims

| Claim | Status |
|---|---|
| Runtime compatibility / production breakage | **No.** Parser output says so: “Still not a runtime compatibility proof.” No live calls, no patch apply. |
| Paid API value, ROI, demand, bid funding | **No.** `paidValueClaim: false` on reports, manifests, and refuse objects. |
| Whole-document no-change | **No.** Scope is used-operations-only. |
| Remote `$ref` / network OpenAPI | **No.** Local captures only; unresolved non-local refs are uncertainties, not invented schemas. |
| Marketplace package / S127 export | **No.** Out of scope. |
| Replacement of S134 | **No.** Pin `65ce1867…` remains the parser. |

Free baseline: offline `diff` / eyeball of the two YAML files. This family adds
a **scoped** used-op JSON report plus a reusable pin/manifest — not a paid
monitoring product.

# R2-CAPABILITIES-07 — Buyer-controlled context pack

Isolated experiment under `experiments/scale-r2-20260910/capabilities/07` in
**`epistemedeus/pilot`**.

## Outcome

Build a **bounded invocation pack** containing only **required caller data** and
**endpoint scope**, with **dry-run readback**.

1. **Input** — `capabilityContract` (or Cap01-shaped `requiredInputs`) +
   `callerProvided` values + `endpointScope` (method, path/url pattern,
   allowed header **names** — no secret values)
2. **Pack** — includes ONLY fields listed as required/allowed; drops extras;
   never invents missing secrets (lists them in `missingInputs`)
3. **Dry-run readback** — echoes what would be sent; secret-shaped values marked
   `secret:true` appear as `[REDACTED]`; **no network calls**
4. **Status** — `ready` | `partial_input` | `rejected`

## Constraints

- `dryRun: true`, `paidCalls: false` on every output
- No `buyerCount`, revenue, ranking, escrow, custody, or `claimAuthority`
- No live paid calls; synthetic / public fixtures only
- Feature-branch source/tests only — Root owns merge, publication, and paid actions
- Do **not** implement CAPABILITIES-02 / 03 / 06

## Preflight (reuse decision)

| Existing | Why not reused as this package |
| --- | --- |
| R2-CAPABILITIES-01 task requirements envelope | Produces requiredInputs / evidence — **input shape semantics reused**; Cap07 packs an invocation + dry-run readback |
| Cap04 cost dry-run comparison | Quote vs free alternatives — different journey |
| revenue-swarm payment / x402 helpers | Live or payment-offer oriented — forbidden here |

**Mirrored from Cap01 (no hard cross-branch import):** `capabilityContract.inputs`
and envelope `requiredInputs[]` descriptor fields (`id`, `name`, `kind`,
`required`, optional `secret` / `place`). Documented via `reuseFrom: ["R2-CAPABILITIES-01"]`.

## Schema

- Input: `pilot.r2.capabilities.buyer_context_pack_input.v1`
- Output: `pilot.r2.capabilities.buyer_context_pack.v1`
- Status: `ready` | `partial_input` | `rejected`

### Output fields (summary)

`schema`, `taskId`, `generatedAt`, `status`, `endpointScope`, `includedInputs[]`,
`excludedExtras[]`, `missingInputs[]`, `dryRunReadback { method, url, headers,
bodyPreview }`, `dryRun: true`, `paidCalls: false`, `mutationBoundary`.

### Input shape

```json
{
  "taskId": "…",
  "capabilityContract": {
    "id": "public-docs-observe.v1",
    "inputs": [
      { "id": "Authorization", "kind": "secret", "required": true, "secret": true, "place": "header" },
      { "id": "source_uri", "kind": "https_url", "required": true, "place": "body" }
    ]
  },
  "callerProvided": { "source_uri": "https://example.com/docs" },
  "headerValues": { "Authorization": "Bearer …" },
  "endpointScope": {
    "method": "POST",
    "url": "https://example.com/api/v1/observe",
    "path": "/api/v1/observe",
    "allowedHeaders": ["Authorization", "Content-Type"]
  }
}
```

`requiredInputs[]` may be used instead of (or alongside) `capabilityContract.inputs`.

## Fresh consumer

Requires Node ≥ 20. No `npm install` (pure Node ESM, zero dependencies).

```sh
cd experiments/scale-r2-20260910/capabilities/07
npm test
npm run demo
node src/cli.mjs pack fixtures/positive.json
node src/cli.mjs pack fixtures/partial-missing-secret.json
node src/cli.mjs pack fixtures/negative-forbidden.json
node src/cli.mjs validate fixtures/positive.json
```

Or from repo root:

```sh
node --test experiments/scale-r2-20260910/capabilities/07/tests/*.test.mjs
node experiments/scale-r2-20260910/capabilities/07/src/cli.mjs demo
```

## Mutation boundary

Exact feature-branch source only. Do not merge/publish/pay from this package.

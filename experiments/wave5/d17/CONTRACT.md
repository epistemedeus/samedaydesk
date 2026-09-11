# W5-D17 domain-outcome contract

Schema `samedaydesk.wave5.d17.domain-outcome.v1`. Thin consumer of the current
SDS52 wrapper at `aeef964fa188443078958d9d6d393afae1d542ee`. Not a second
runner. D01 binds receipts to this object; M01 keeps or maps engine `status`.

## Outcome (one field)

| `outcome` | Meaning |
| --- | --- |
| `analysis_change` | Engine envelope `ok: true`, `status: actionable`, catalog outputs present. |
| `analysis_no_change` | Same delivery, `status: informational`. Useful when the pair has no domain delta. |
| `analysis_refusal` | Same delivery, `status: refused`. A refusal artifact is useful delivery. |
| `analysis_partial` | Same delivery, `status: partial`. |
| `incomplete_delivery` | Engine ran; catalog outputs missing. Not a complete change/no-change/refusal report. |
| `engine_failure` | Nonzero engine exit or `ok: false` without a complete analysis artifact set. |
| `transport_failure` | No parseable wrapper JSON, uncaught crash, or acquisition failure. |
| `wrapper_refusal` | Pre-engine wrapper code (unknown job, missing inputs, funding). |

`wrapper.ok` is observed only. It is true for change, no-change, and delivered
refusal at this pin. It is also true for incomplete reused `--out-dir` sets.

`receipt.engineResult.refused` is not the analysis layer. At SDS52 it stays
false when `engine.status` is `refused`.

Unlike caller notes, terms, or digest schemas are not forced equal. A
note-only pricing pair and an identical pair can both be `analysis_no_change`
with different engine digests.

## Layers

`layers.transport`, `layers.engine`, `layers.delivery`, `layers.payment`,
`layers.analysis` stay distinct. Payment `unfunded` / `reserved-fixture` is not
analysis success.

## Invoke

```bash
node experiments/wave5/d17/bin/classify-domain-outcome.mjs run vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \
  --out-dir /tmp/d17-out
```

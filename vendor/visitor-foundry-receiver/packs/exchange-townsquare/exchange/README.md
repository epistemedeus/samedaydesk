# R2 Outcome Exchange (`experiments/scale-r2-20260910/exchange`)

Finite packages **01–08** for brief → compare → agree → admit → deliver → correct → lifecycle → dispute, composed by **08**.

## Fresh consumer (local acquisition)

```sh
# 1) Preflight — verify modules present (no network; does not touch published pins)
node --input-type=module -e 'import {preflightExchangePackage} from "./acquisition.mjs"; console.log(JSON.stringify(await preflightExchangePackage(),null,2))'

# 2) Journey demos (from repo root after npm scripts wired)
npm run test:r2-exchange-08
node experiments/scale-r2-20260910/exchange/08/src/cli.mjs demo          # full journey
node experiments/scale-r2-20260910/exchange/08/src/cli.mjs demo-gate     # admission stop
node experiments/scale-r2-20260910/exchange/08/src/cli.mjs demo-correct  # request→correction only
```

## Pins / branches

| Ref | Role |
| --- | --- |
| `17236cd` on `codex/r2-exchange-08-20260910` | **S151 review pin** (read-only) |
| `codex/r2-exchange-08-s152-integration-20260910` | Follow-on integration (gates + S155 acquisition/correction) |

Does not republish `public/downloads/agent-task-kit` or first-job archives. Root owns merge/publish/paid.

## Module map

| ID | Title |
| --- | --- |
| 01 | Executable acceptance brief |
| 02 | Bid-to-requirement comparison |
| 03 | Revision-aware work agreement |
| 04 | Artifact submission admission |
| 05 | Correction request workflow |
| 06 | Cancellation / stale continuation |
| 07 | Dispute evidence packet |
| 08 | Requester-to-delivery journey (+ gates) |

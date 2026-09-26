# Reuse inventory — S181 Exchange × TownSquare (real input)

Read before inventing engines. Composition only. S177 freeze `91bbc48d77278ab4d5941496bbc56e49376be77f` is the prior composed demo; this pack adds a thin real-input adapter on top of the same engines.

## Pins (immutable inputs)

| Role | SHA |
| --- | --- |
| S177 freeze | `91bbc48d77278ab4d5941496bbc56e49376be77f` |
| Exchange S171 | `1e65dabe93af8cf8de0df43511fe844aa53489bd` |
| TownSquare first-run S172 | `25c9040eaf20d83a577d1fc3d49313a50e2938e1` |
| TownSquare kit S170 | `8760ee4dc4b65641dafa7067bd0e153cafdd71c8` |
| Product base (main at S177 cut) | `ee832228d0a7ba7509bf50410ae3b398b5a0b109` |
| S166 intake (separate review) | `2a65a2d7a5a59c5e9a4743e9770f11db9e88e0f5` — do not duplicate |

## Reuse

| Surface | Path | Role |
| --- | --- | --- |
| Exchange 01–08 | `packs/exchange-townsquare/exchange/` | Brief → compare → agree → admit → correct → lifecycle → dispute → receipt |
| TownSquare kit 01–07 | `packs/exchange-townsquare/townsquare/kit/` | Source-linked conversation → scoped task (`demo:true` only) |
| TownSquare first-run | `packs/exchange-townsquare/townsquare/first-run/` | Machine first-use over kit |
| Scale-lab town-square (site) | `scripts/scale-lab/town-square/` | Separate board — link only |
| S166 external-job intake | `packs/external-job-intake/` | Contract reference only |

## Thin layer

| Piece | Path |
| --- | --- |
| Honesty labels | `src/labels.mjs` |
| Demo I/O adapter | `adapter/townsquare-to-exchange.mjs` (fixtures, isolated) |
| Real I/O adapter | `adapter/supplied-input.mjs` |
| Real input schema | `schema/supplied-input.v1.json` |
| Demo composer | `src/composed-journey.mjs` |
| Real journey | `src/real-journey.mjs` |
| CLI | `src/cli.mjs` (`demo` vs `run`/`import`) |
| Lab page | `src/pages/lab/exchange-townsquare.astro` |
| Archive | `public/downloads/exchange-townsquare/` |

## Honesty labels

`fixture_demo` · `supplied_local` · `external_discovery` (reserved) · `local_run_ok`

Never emit `actual_completion`. Local gate pass is not customer adoption.

## S181 residuals from S177 demo composer

1. Demo journey required `conversation.demo:true` and was not a general supplied-data consumer — real path is `run`/`import`.
2. Demo adapter copied `requirements.positive.json` and fixture proposals/artifacts — real adapter never loads those files.
3. Demo happy/correction synthesized requester accept; `objective_auto` cleared subjective criteria — real path never does that.
4. Demo success was labelled `actual_completion` — now stays `fixture_demo`; real pass is `local_run_ok`.
5. Real runs use current or injected time; fixture clock is demo/test only.

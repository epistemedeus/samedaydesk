# Exchange × TownSquare lab pack (S181)

Portable Node 22 lab. Reuses TownSquare kit + Exchange 01–08. Thin adapters only — no new parser or marketplace backend.

S177 freeze (do not rewrite as this product): `91bbc48d77278ab4d5941496bbc56e49376be77f`.

## Two entry paths

| Command | What it is |
| --- | --- |
| `demo` | Bundled fixtures, synthetic TownSquare conversation, deterministic demo clock. Always labelled `fixture_demo`, even when local gates pass. |
| `run` / `import` | Caller-supplied JSON. Requirements, proposals, and artifacts as provided. Clock defaults to now (inject `--clock` for tests). |

`run` does **not** extract arbitrary conversations into exchange criteria. TownSquare linking is the honest synthetic-kit adapter (`source.kind=townsquare_synthetic_conversation` and `conversation.demo:true`). Prefer `source.kind=structured_task` with explicit requirements.

## Honesty labels

| Label | Meaning |
| --- | --- |
| `fixture_demo` | Demo command only |
| `supplied_local` | Caller-provided JSON on this machine |
| `external_discovery` | Reserved — this pack refuses to invent it |
| `local_run_ok` | Local gates passed (accepted + admitted + lifecycle completed + exact replay). **Not** customer adoption or external completion |

This pack never emits `actual_completion`.

No escrow, token, payment backend, or external-customer claims.

## Contract

Caller-supplied input: `schema/supplied-input.v1.json` (`neomorphic.r2.exchange_townsquare.supplied_input.v1`).

Must supply:

- task requirements (objective and/or subjective as they actually are)
- proposals + chosen proposal id
- file artifact (and optional correction)
- optional lifecycle events
- optional **explicit** requester decision (`accept` bound to artifact + revision, or `reject`)

Rules the engines already enforce:

- Missing subjective decision → `needs_review`
- Wholly objective tasks may complete via `automatic_objective_evidence` (not counterparty acceptance)
- Explicit `reject` stays `rejected` even if objective evidence would pass
- Full admission + exact receipt/replay binding remain required
- Criteria are never replaced with `exchange/01` fixture values

Two distinct examples: `fixtures/supplied-task-a/` (synthetic TownSquare identity + subjective criterion) and `fixtures/supplied-task-b/` (structured task, wholly objective).

## Quick start

```bash
node src/cli.mjs preflight
node src/cli.mjs demo --mode happy
node src/cli.mjs demo --mode objective_auto
node src/cli.mjs demo --mode correction
node src/cli.mjs demo --mode reject
node src/cli.mjs run --input fixtures/supplied-task-a/input.json
node src/cli.mjs import --input fixtures/supplied-task-b/input.json
node --test tests/*.test.mjs
```

## Pins

| Role | SHA |
| --- | --- |
| S177 freeze | `91bbc48d77278ab4d5941496bbc56e49376be77f` |
| Exchange S171 | `1e65dabe93af8cf8de0df43511fe844aa53489bd` |
| TownSquare first-run S172 | `25c9040eaf20d83a577d1fc3d49313a50e2938e1` |
| TownSquare kit S170 | `8760ee4dc4b65641dafa7067bd0e153cafdd71c8` |
| S166 intake (separate) | `2a65a2d7a5a59c5e9a4743e9770f11db9e88e0f5` — cite only |

Read `REUSE-INVENTORY.md` before inventing engines.

## Layout

- `exchange/01–08` — Exchange engines
- `townsquare/kit` + `townsquare/first-run` — TownSquare engines (kit remains `demo:true` only)
- `adapter/townsquare-to-exchange.mjs` — **demo** fixture adapter
- `adapter/supplied-input.mjs` — **real** supplied-input adapter
- `schema/supplied-input.v1.json` — real input contract
- `src/composed-journey.mjs` — demo composer
- `src/real-journey.mjs` — supplied run/import
- `src/cli.mjs` — `demo` vs `run`/`import`
- `fixtures/supplied-task-a|b/` — two distinct non-fixture tasks
- `tests/` — composed + supplied + CLI regressions

S166 external-job intake stays a separate package; this pack may cite its contract id only.

# R2-CAPABILITIES-01 — Task requirements envelope

Isolated Neomorphic experiment under `experiments/scale-r2-20260910/capabilities/01`.

## Outcome

Normalize supplied job requirements into an **envelope**:

1. **requiredInputs** — concrete caller-supplied inputs (from requirements + optional capability contract)
2. **outputConstraints** — artifact format/size/required fields + objective check constraints
3. **acceptableEvidence** — objective check kinds + subjective unresolved markers (+ capability evidence bindings)

Status is `ready` | `partial_input` | `rejected` with explicit `missingInputs[]`. Never invents missing facts.

This is **not** an acceptance brief (see R2-EXCHANGE-01). It does not run objective checks against artifacts and does not claim `overall.accepted`.

## Preflight (reuse decision)

| Existing | Why not reused as this package |
| --- | --- |
| `scripts/scale-lab/work-board` | Freeform deliverable strings; does not generate this envelope |
| R2-EXCHANGE-01 acceptance brief | Generates runnable brief + check runner; different journey — **requirement semantics reused** |
| `experiments/revenue-swarm-0907/c4` capabilities tokens | Allowlist of capability name tokens only |
| `experiments/commons-20260909/task-memory-contract` | Observation/material-change epistemic contract; not a requirements envelope |

**Reused from R2-EXCHANGE-01:** `neomorphic.r2.exchange.task_requirements.v1` shape, `CHECK_KIND`, `CRITERION_CLASS`, `validateTaskRequirements` semantics, `FORBIDDEN_BRIEF_FIELDS`. Documented via `requirementsRef.reuseFrom = "R2-EXCHANGE-01"`. A capabilities schema alias `pilot.r2.capabilities.task_requirements.v1` maps to the same shape.

## Fresh consumer

```sh
node experiments/scale-r2-20260910/capabilities/01/src/cli.mjs demo
node experiments/scale-r2-20260910/capabilities/01/src/cli.mjs envelope experiments/scale-r2-20260910/capabilities/01/fixtures/requirements.positive.json
node --test experiments/scale-r2-20260910/capabilities/01/tests/*.test.mjs
```

Input may be:

- **A)** plain Exchange-shaped task requirements JSON
- **B)** `{ requirements, capabilityContract?, providedInputs? }` (synthetic capability descriptors only)

## Mutation boundary

Feature-branch source/tests only. Root owns merge, publication, and paid actions.

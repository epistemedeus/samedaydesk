# R2-CAPABILITIES-08 — Install-to-first-result walkthrough (thin early)

Isolated experiment under `experiments/scale-r2-20260910/capabilities/08` in
**`epistemedeus/pilot`**.

## Outcome

Compose **capability discovery → prerequisites → envelope → cost dry-run →
supplied-result verification** (plus optional fallback) into **one portable
offline executable demo**.

This is a **thin early promote**. Cap02 / Cap03 / Cap06 are **Heavy S138-owned**
and appear here only as labelled stubs. Cap01 + Cap04 are wired when sibling
worktrees (or in-repo siblings) are present; otherwise schema-compatible stubs
are used. Cap05 is optional: when resolvable, `fallback_plan` calls real
`buildFailureFallbackPlan`; when absent, the stage stays `not_run`.

## Stage table (thin vs stub vs real)

| Stage | Cap | Implementation in Cap08 |
| --- | --- | --- |
| `discovery` | Cap02 | **stub** (`heavyLaneOwned`) — fixture-driven matches only |
| `prerequisites` | Cap03 | **stub** (`heavyLaneOwned`) — assumed-met offline list |
| `envelope` | Cap01 | **real Cap01** when sibling worktree/path present; else thin stub |
| `cost_dry_run` | Cap04 | **real Cap04** when sibling worktree/path present; else thin stub |
| `verify` | (local) | **thin local** requiredFields + objective checks on supplied fixture — **not** Cap06 |
| `fallback_plan` | Cap05 | **real Cap05** (`implementation: cap05`) when sibling worktree/path exports `buildFailureFallbackPlan`; else **`not_run`** (backward compatible). Uses `input.failedOutcome` or a synthetic failed-outcome from verify. Preserves Cap05 ambiguous-mutation semantics (`rolled_back` never claimed true). |

Evidence-binding (**Cap06**) is **not** implemented; verify documents
`heavyLaneOwned: R2-CAPABILITIES-06`.

## Constraints

- Offline dry-run only: `dryRun: true`, `paidInstall: false`, `liveNetwork: false`
- Never claims paid install or live network
- No Cap02/03/06 implementation beyond stubs labelled `heavyLaneOwned`
- Synthetic / public fixtures only
- Feature-branch source/tests only — Root owns merge, publication, and paid actions
- Native tools only — no CloudAgent

## Schema

- Output: `pilot.r2.capabilities.install_first_result_walkthrough.v1`
- Status: `ready` | `partial_input` | `failed` | `rejected`
- `dependsOn`: Cap01, Cap04
- `heavyLaneOwned`: Cap02, Cap03, Cap06
- `thinEarlyPromote: true`

## Dependency resolution

`src/deps.mjs` prefers, in order (portable — no machine-specific absolute paths):

1. In-repo sibling Cap packages (`../01`, `../04`, `../05`)
2. Repo-relative `experiments/scale-r2-20260910/capabilities/{01,04,05}` when resolved from package root
3. Embedded Cap01/Cap04 schema-compatible stubs (`src/stubs/cap01_cap04.mjs`); Cap05 stays unavailable → `not_run`

## Fresh consumer

Requires Node ≥ 20. No `npm install` (pure Node ESM, zero dependencies).

```sh
cd experiments/scale-r2-20260910/capabilities/08
npm test
npm run demo
node src/cli.mjs demo
node src/cli.mjs run path/to/composed-input.json
```

Or from repo root:

```sh
node --test experiments/scale-r2-20260910/capabilities/08/tests/*.test.mjs
node experiments/scale-r2-20260910/capabilities/08/src/cli.mjs demo
```

## Mutation boundary

Exact feature-branch source only. Do not merge/publish/pay from this package.

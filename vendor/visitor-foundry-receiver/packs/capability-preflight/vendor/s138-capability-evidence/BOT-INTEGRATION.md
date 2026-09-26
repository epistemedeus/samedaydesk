# Bot Capability Delivery contract (01 / 04 / 05 / 07 / 08)

This package **owns** R2-CAPABILITIES-02, 03, 06 only.

The Bot Capability Delivery role owns:

| ID | Title | Integration surface from this package |
| --- | --- | --- |
| R2-CAPABILITIES-01 | Task requirements envelope | May emit a job/declaration object consumed by `bind-evidence` / `compose-partial` (`declaration.capabilityId`, `job.schema|scope|requiredFields`). Do not fork a second envelope schema here. |
| R2-CAPABILITIES-04 | Cost-aware dry-run comparison | Out of scope. Consume readiness from `resolve-prereqs` (`readiness`, `gaps`) as a free/prerequisite signal only; never trigger paid calls from this package. |
| R2-CAPABILITIES-05 | Failure fallback plan | Out of scope. May read `prerequisites` with `state=missing|blocked` and `gaps[]` from 02 reports, and `status=untested_declaration` from 03. |
| R2-CAPABILITIES-07 | Buyer-controlled context pack | Out of scope. Packs must remain data-only (manifest/declaration/parts JSON). This CLI refuses instruction-as-input. |
| R2-CAPABILITIES-08 | Install-to-first-result walkthrough | Out of scope. Can shell the three demos in order: `resolve-prereqs` → `bind-evidence` → `compose-partial` / `demo`. |

## Schemas to import

- `schemas/v1/prereq-report.schema.json`
- `schemas/v1/evidence-binding.schema.json`
- `schemas/v1/partial-composition.schema.json`

## Stable exports

```js
import {
  resolvePrerequisites,
  bindEvidence,
  composePartial,
} from "./src/index.mjs";
```

Caller inputs are JSON **data**, never free-form instructions.

No private auth material is accepted or emitted by this package.

## Status vocabulary (pin these)

| Surface | Positive / success | Negative / hole |
| --- | --- | --- |
| `resolvePrerequisites.readiness` | `ready` only with ≥1 `satisfied` **runtime-probe** or **filesystem-probe**, zero `unknown`/`missing`/`blocked`, empty `gaps` | `partial`, `not_ready` |
| `bindEvidence.status` | `content_bound` (bytes+TAP shape only) | `untested_declaration` |
| `bindEvidence.executionVerified` | always `false` (library never attests a live run; ignores caller `executionVerified`) | — |
| `composePartial` part intake | `part.status === "complete"` only (supplied assertion) | absent, `ok`, `unknown`, `running`, `failed`, `partial`, `rejected`, `completed`, typos |
| `composePartial.status` | `complete` / `partial` / `empty` | — |

## S164 migration notes (Bot CAP01/04/05/07/08 unchanged)

Bot branches for CAP01/04/05/07/08 are **not** modified. Pin coherent final 02/03/06 reports as follows:

1. **resolvePrerequisites / readiness**
   - `ready` requires ≥1 satisfied **boolean** `runtime-probe` or `filesystem-probe`. Manifest rows and `accepted-contract` (including `atk-execute-false`) never manufacture readiness alone.
   - `{manifest:{}}` and `{name:"agent-task-kit"}` without probes are not ready.
   - Probe fields must be boolean `true`/`false`. Truthy strings/numbers are ignored and recorded as gaps.
   - Observations remain **caller-supplied data**, not remote attestation.

2. **bindEvidence**
   - Positive status is **`content_bound`**, not `bound`.
   - Always emits `executionVerified: false`. Do not send or expect a caller-set `executionVerified: true` trust field.
   - `claimed` / `observed` may include `parsedTestFacts` from imported TAP text (`source: "imported_content"`); that is not proof of execution against the claimed source revision.
   - Digest/revision contradictions still yield `untested_declaration`.

3. **composePartial**
   - `part.status` must be the explicit string **`complete`**. Absent / `ok` / `unknown` / `running` / `failed` / `partial` / `rejected` / `completed` / typos remain holes.
   - Explicit `complete` is a supplied assertion, not attested execution.
   - `job.schema` / `job.scope` are trimmed; whitespace-only is diagnostic-missing (`job-schema-missing` / `job-scope-missing`), not universal compatibility.
   - Required fields that are `null`/`undefined` or only present via `__proto__`/`constructor`/`prototype` count as missing; field conflicts retained.

4. **CAP04 / CAP08**
   - Treat `partial` / `not_ready` / `untested_declaration` / non-`content_bound` as non-executable until gaps clear.
   - Walkthrough stages that previously checked `status === "bound"` must check `status === "content_bound"` and `executionVerified === false`.

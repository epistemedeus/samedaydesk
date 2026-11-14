# Observations: actual provider versus fixture

## Actual provider

| Provider | Artifact | Status | What it means |
| --- | --- | --- | --- |
| n8n Cloud | earlier kit, `integrations/workflow-kits-n12/n8n/record-to-accepted-output.workflow.json` at `783f0841d56a44acd4dcce1b5a29a5060e04824b`, sha256 `4a7d556b9720a64637bb1811b48284035a37a2f063961d7351559bdba694362b` | received | The operator created it through the existing n8n API key (workflow id `0ouvpy0FyuZ1WkIe`, 2026-11-12 11:24:30 UTC), read it back exact (15 nodes, inactive, no credentials), then deleted it (GET 404, 11:24:34 UTC). Nothing was executed. Receipt: `integrations/workflow-kits-n12/IMPORTS.md` at `806ebd9efe60b41943814bfb87bb293ea0d7fc9d`. |
| Make | earlier kit blueprint, sha256 `92b9976f60d6586540bf601e7e6315a56684946603c0b0ca7308bac5cffb588e` | unreceived | No hosted Make import. The existing-account sign-in route is unresolved. Nothing was created in Make. |

Import acceptance is not an executed hosted workflow and not paid or commercial
acceptance.

## This kit

| Artifact | Provider import | Evidence |
| --- | --- | --- |
| `n8n/changed-period.workflow.json` | unsupported, unreceived | fixture only |
| `make/changed-period.blueprint.json` | unsupported, unreceived | fixture only |

The earlier n8n Cloud QA import does not carry over to this artifact. The sha256 of
each artifact is in `OBSERVATIONS.json` and `EFFORT.json`.

## Fixture and simulation results

Everything in `EFFORT.json` comes from the deterministic simulation in
`src/simulate.mjs` and `src/scenario.mjs`: the committed graphs executed against an
in-process client endpoint that runs the vendored journey, with faults injected at
that endpoint only. No Make or n8n service was contacted.

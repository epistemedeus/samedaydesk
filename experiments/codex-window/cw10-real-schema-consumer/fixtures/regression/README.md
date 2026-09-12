# CW14 regression handoff

`before.json` and `after.json` are a **derived projection**, not the complete
Octokit schemas. `regressionProjection()` copies the exact adjacent revision's
root `type`, `required`, `additionalProperties`, and property names, replacing
each property's value schema with `{}`. The fixture is 644 bytes across the two
schemas. It contains no external `$ref`, format assertion, or combinator.

Use the engine CLI with these two files:

- `--used used.json`: selects the root. Released 1.4.0 and CW14
  `8b75201761a8b58a6d00f16d9eb825c15fc5b68b` return `actionable`, one breaking
  `required-changed` row.
- `--used keyword-used.json`: selects `/required` and the unchanged
  `/additionalProperties` control. Both versions return `informational`, two
  unchanged pointers, zero breaking and zero unknown. This is the remaining
  consumer false negative. Classify the keyword in its parent-schema context,
  or report that the selection is unsupported. Silent equality loses real
  required-member changes.

`../payloads/saved-membership.json` validates under the full **before** schema
and under this projection, and fails both **after** schemas. The reverse holds
for `../payloads/migrated-changes.json`. The consumer test checks this using Ajv.
Those are composed/official fixtures, not observed customer deliveries.

The exact official source pair is recorded in `../manifest.json` and vendored
under `../upstream/organization-renamed/`. The full raw root refuses on relative
resource references, so do not label a projection pass as full-schema engine
support. All complete-body validation uses Ajv Draft7 and the pinned reference
closure separately.

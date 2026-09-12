# Patch proposal for the shared engine owner

This directory does not modify the released engine or its source.

## Reproduction

The official `octokit/webhooks` Draft 7 schema replaced `membership` with
`changes` in the root `required` array for `organization.renamed`. With
`/required` declared as used, useful-jobs 1.4.0 reports `informational` and zero
breaking rows. AJV (Another JSON Schema Validator) proves that
`saved-membership.json` is valid before the change and invalid after it.

Selecting the empty root pointer is not a usable consumer workaround for this
pair: the released engine refuses because the root fingerprint encounters the
schema's relative `$ref` values.

## Narrow proposed correction

When the selected pointer resolves to a `required` keyword, compare its string
members as a set rather than fingerprinting it as a generic JSON array:

- after minus before: `breaking`, reason `required-added`;
- before minus after: `compatible`, reason `required-removed`;
- order-only change: `unchanged`.

Keep existing refusal behavior for malformed non-string members. Add this exact
fixture as a regression test. A broader root-level reference resolver is a
separate change and is not required to fix this false negative.

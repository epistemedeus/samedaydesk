# Remaining regression for the CW14 engine owner

At exact CW14 head `8b75201761a8b58a6d00f16d9eb825c15fc5b68b`, the
`organization.renamed` required-member swap still reports `informational` when
`/required` is selected. The full source documents are classified as
`json-schema`; hashes in the returned brief match the actual upstream files.
This is not a webhook-example detection accident.

`fingerprintSchemaNode()` reduces selected arrays to `{kind: "literal",
jsonType: "array"}`. `classifyPair()` then sees equal fingerprints. It has lost
the string members before comparison. Passing the schema's whole root refuses
on relative external resource `$ref`s, so that is not a full-schema workaround.

The [small derived regression](fixtures/regression/README.md) removes that
reference limitation without claiming to be the full official schema. Both
release and CW14 recognize its root-level change as breaking, but both miss the
same `/required` selection. The complete Ajv witness establishes a real change
to the set of accepted request bodies.

A correction should preserve the selected keyword's document context before
fingerprinting. A selected `required` keyword should compare string members as
a set, including unchanged reorderings. An added required name may be breaking;
a removed required name by itself weakens the requirement. Do not reuse this
rule for arbitrary arrays in webhook examples or for an array-valued `enum` or
`const`. Malformed keywords must be refused or unknown. Where interactions
prevent an inclusion proof, explicit unknown is preferable to silent equality.

This source change also removes `properties.membership` under
`additionalProperties: false`: membership becomes forbidden. It adds the
required nested `changes.login.from` structure. The concrete old-valid/new-invalid
body proves that this specific combined change breaks backward acceptance;
required-name removal alone does not establish that conclusion.

No shared engine edit is included. CW14 owns the semantic fix and its API
contract; this consumer supplies a pinned reproduction and candidate readback.

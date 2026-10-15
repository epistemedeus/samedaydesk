# Adding an adapter

An adapter normalizes one known source contract into an observation. It does
not fetch URLs and it does not send anywhere. The subscription names a
`receiverId`. The process registry decides how that id is reached.

## 1. Declare the contract

Create `src/adapters/<name>.mjs` and export:

- `id`
- `schemaId` copied from that source's exported constant
- `MATERIAL_FIELDS`: task fields a subscription may narrow to
- `NON_SEMANTIC`: fields ignored because that source contract says they are
  presentation or clocks, with the reason written next to the field
- `normalize(subscription, document, ctx)`

Use `observation()` from `src/adapters/shape.mjs`.

The source-projection adapter already accepts both the published observatory
envelope and the pinned maintained-projection document. A new adapter is not
required for that contract. Label supplied fixtures with `capture: "fixture"`
so they stay distinct from `live` and `seeded` reads.

Return `evidenceClass: "comparable"` only when the document is complete enough
to compare. Otherwise return one of:

| Class | When |
| --- | --- |
| `missing` | The source has no row, or required evidence is absent |
| `stale` | The source clock or freshness flag says the row is outside its window |
| `incomparable` | Schema, scope, or coverage does not support a comparison |
| `source_failure` | The reader failed, or the source reported an error |

Leave `material` null for every non-comparable class. Do not coerce a missing
metric to `0`. Put coverage and source version on the observation; the seal
step folds both into the compared material for comparable rows.

`ctx.correctsEvidenceId` must be copied onto the observation. Do not edit a
previous evidence row.

## 2. Register it

Add the adapter to `src/adapters/registry.mjs` and add a scope pattern in
`src/subscription.mjs`. Scope patterns reject arbitrary strings. Do not accept
a URL as a scope.

If the source package exports a schema constant, import that constant. If
loading the package would pull a payment or network dependency, pin the
exported string by reading the source file in `test/pins.test.mjs` and set
`loadedAtRuntime: false` in `PINS.json`, as Route Lock does.

## 3. Prove the matrix

Add tests for:

- first comparable document establishes a baseline and emits no event
- a presentation-only timestamp is `unchanged`
- a material field change emits one `content_changed` event
- the same document again does not emit a second event
- missing, stale, and wrong-schema documents are not `content_changed`
- a comparable document after a failure, with the same material, is
  `service_restored`
- two overlapping `observe` calls produce one event id

Register a receiver in code or as loopback `local-http`. Do not add a
subscription field that carries a destination URL.

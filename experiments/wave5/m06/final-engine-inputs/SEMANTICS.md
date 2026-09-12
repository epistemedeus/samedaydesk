# Specified semantics for the RC check

Dialect: JSON Schema Draft 2020-12 instance-set inclusion at the supplied
`--used` pointer. Same contract as `../SEMANTICS.md`. This folder does not
replace that corpus and does not reimplement used-path drift.

`--used` other than `""` isolates that applicator. Unused sibling edits must
not drive the used-path verdict. A false safe/unsafe finding only counts when
it changes a supplied used pointer.

| Specified relation | Meaning |
| --- | --- |
| incompatible | Some instance valid at the used node before is invalid after. |
| compatible | Every before-valid used-node instance remains valid after. Weakening admits a newly valid instance. |
| refuse | Transport/input refusal (missing flags, remote `$ref`, OpenAPI). |

`nullable` is not a Draft 2020-12 keyword. The shipped fingerprint stores it,
so this check treats `nullable: true` as allowing JSON `null` in addition to
`type`. Honest `unknown` would also be acceptable; a certain safe/unsafe
verdict is not.

`allOf` / `prefixItems` are not advertised in the D01 FEATURE-MAP table.
Honest `unknown` is acceptable. `unchanged` / `breaking` with certainty is not.

Type `integer` is a subset of `number`. `type: "string"` and `type: ["string"]`
are the same instance set.

## Engine claim mapping

| Engine | Claim |
| --- | --- |
| `breaking` / `deleted` / `added` | unsafe |
| `compatible` / `unchanged` / `informational` | safe |
| `unknown` | unknown (honest unsupported) |
| `ok: false` `refused: true` | refuse |

Do not relax specified labels to match engine output.

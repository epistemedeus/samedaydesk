# Specified schema semantics (W5-M06)

Dialect: JSON Schema Draft 2020-12. Compatibility is **instance-set inclusion**
at the supplied document, not byte equality and not Co10's fingerprint.

When `--used` names a pointer other than the document root, witnesses isolate
that applicator. Unused sibling fields may change without making the used-path
case incompatible.

A change is **incompatible** (strengthening) when some instance is valid under
the before schema and invalid under the after schema. A change is
**compatible** when every before-valid instance remains valid after. Compatible
changes that admit a newly valid instance are **weakening**. Compatible changes
with the same applicators (including required-array order only, unused-path
edits, and annotation-only `description`) are **unchanged**.

Unlike schema documents keep unlike content digests. Do not force
`termsVersion` hashes equal across unlike inputs, unlike I01 kernel terms, or
disclosure/settlement documents.

## Applicators covered by this corpus

| Applicator | Specified rule |
| --- | --- |
| Boolean schema `true` | Matches every instance. |
| Boolean schema `false` | Matches no instance. |
| `type` | Instance JSON type must be a listed type. |
| `const` / `enum` | JSON equality. |
| `required` | Missing listed properties fail. Order of the array is not a change. Adding a required name is strengthening. Removing one is weakening. |
| `additionalProperties` boolean | `false` rejects undeclared properties. `true` allows them. Switching `false` to `true` is weakening. |
| `minimum` / `maximum` | Compare as JSON numbers, including non-integers. |
| `exclusiveMinimum` / `exclusiveMaximum` | Draft 2020-12 numeric form. `exclusiveMinimum: 0` rejects `0`. |
| `$ref` | Local `#` / `#/` only. Remote refs are a **refusal**, not a compatibility class. |
| `$ref` siblings | Draft 2020-12: the instance must satisfy the referenced schema **and** sibling keywords. |

## Outcomes versus transport

| Result | Meaning |
| --- | --- |
| `ok: true` plus breaking/unchanged rows | Analysis outcome. |
| `ok: false`, `refused: true`, exit 2 | Valid refusal (remote `$ref`, integer `termsVersion`, OpenAPI, missing inputs). |
| Nonzero crash, missing stdout, missing engine | Engine/transport failure. Incomplete, never a skipped pass. |

This file is the witness contract. W5-M02 owns the comparison engine. This
package does not reimplement used-path drift.

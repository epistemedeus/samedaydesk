# FEATURE-MAP — funded-task terms (F17)

Map of the published contract so F01/F04 can depend on this directory without forking it.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| S275 DESIGN tree | **Not present** on `neomorphic-io` `main`. Names follow the F17 pin and the S275 reuse list in the assignment. |
| `services/earned-work/` | **Absent**. This pack is the importable schema (`parseTerms`, `assertTerms`, `hashTermsVersion`). Do not copy the Zod object into F01. |
| Sibling Wave 1 IDs (F01/F04/…) | **Not implemented here.** |

## `termsVersion` kind

**Content hash**, not an integer.

| Field | Kind | Notes |
| --- | --- | --- |
| `schema` | string const | `neomorphic.funded-task-terms.v1` |
| `schemaVersion` | integer | Shape version `1`. Bump only when the schema shape changes. |
| `termsVersion` | content hash | `sha256:` + 64 lowercase hex. Hash of canonical JSON of the document **without** the `termsVersion` field. Lexicographic keys, integer numbers only. |

`hashTermsVersion(input)` computes that hash. `parseTerms` fills or checks it. Changing any terms field changes the hash. Do not rewrite `fundingState` on a hashed blob; F04 should keep ledger transitions beside the terms.

## S275 reuse surface

| S275 / F17 name | Pack field | Notes |
| --- | --- | --- |
| Reward never float | `reward.amount` string | `{ amount, asset, network }`. Optional `amountAtomic` + `decimals` (USDC=6). JS numbers / exponent / NaN / Infinity rejected. |
| Opaque `taskId` | `taskId` | 1–128 chars. Not a URL, grant, or capability. |
| Immutable `termsVersion` | `termsVersion` | Content hash (above). |
| `fundingState` | `fundingState` | `unfunded \| reserved \| funded \| released \| expired \| cancelled \| failed`. Snapshot on the terms document. |
| Reservation expiry | `reservationDuration` required; `reservationExpiresAt` optional ISO instant | Duration is integer seconds **or** ISO-8601 duration. |

## Required terms (F17)

| Requirement | Field | File |
| --- | --- | --- |
| Reward atomic units / asset / network | `reward` | `src/schema.ts`, `src/money.ts` |
| Exact artifact | `artifact.{ref,digestSha256,mediaType,bytes}` | `src/schema.ts` |
| Acceptance criterion | `acceptanceCriterion.{id,text}` | frozen text/id |
| Verifier version | `verifierVersion` | required string |
| Expected or unknown effort | `effort` | `{ kind: "expected", value, unit }` or `{ kind: "unknown" }` |
| Contributor licensing | `contributorLicense` | SPDX `{ kind: "spdx", spdxId }` or `{ kind: "custom", text }` |
| Reservation duration | `reservationDuration` | seconds integer or ISO duration |
| One bounded correction policy | `correctionPolicy.maxCorrections` integer 0..16 | absent or negative = unlimited → reject |
| Payment timing | `paymentTiming` | owed `on_requester_accept`; rail `outside_this_pack` |
| Failure/appeal route | `failureAppealRoute` | opaque `{ id, decider, boundTo: "requester_only_accept" }` |
| Provenance | `provenance` | `test \| fixture \| production` |

## Authority invariants

| Invariant | Where |
| --- | --- |
| Artifact is metadata only | `execute: false`; `src/forbidden.ts` rejects executable-payload keys; validator never `eval`s, `fetch`es, or `spawn`s against `artifact.ref` |
| LLM verdict is not fund authority | `fundTransferAuthority.llmVerdictAlone: false` and `requesterAcceptRequired: true` |

## F01 / F04 consumption

| Consumer | Import | Must not |
| --- | --- | --- |
| F01 | `parseTerms`, `assertTerms`, `hashTermsVersion`, JSON Schema. Integration tree imports `hashTermsVersion` from this pack (no third hasher). | Fork a second reward/terms schema |
| F04 | Same, plus `fundingState` enum and `paymentTiming`. Integration treats `termsVersion` as an opaque hash FK. | Treat this pack as a payout rail; `railMayPay` is outside this pack |

Package name: `@neomorphic/funded-task-terms`.

## Seeded negatives

| Fixture | Code |
| --- | --- |
| `fixtures/negatives/float-reward.json` | `float_reward` |
| `fixtures/negatives/missing-verifier-version.json` | `missing_verifier_version` |
| `fixtures/negatives/max-corrections-absent.json` | `unbounded_corrections` |
| `fixtures/negatives/max-corrections-negative.json` | `unbounded_corrections` |
| `fixtures/negatives/missing-reservation-duration.json` | `missing_reservation_duration` |
| `fixtures/negatives/missing-appeal-route.json` | `missing_appeal_route` |
| `fixtures/negatives/artifact-executable-payload.json` | `artifact_executable_payload` |

## Files

| Path | Role |
| --- | --- |
| `src/index.ts` | Public exports |
| `src/schema.ts` | Zod (runtime authority, same family as correspondence) |
| `src/validate.ts` | `parseTerms` / `assertTerms` |
| `src/hash.ts` / `src/hash.mjs` | `hashTermsVersion` (JS implementation so F01/F02/F07 can import without tsx) |
| `schema/funded-task-terms.v1.json` | Published JSON Schema |
| `bin/validate.mjs` | `node` validator |
| `fixtures/golden/complete.terms.json` | Complete accepted document |
| `tests/*.test.ts` | Golden, seeded negatives, JSON Schema, CLI |

# Interop draft v0

Projected by `src/interop.mjs` from comparison records. This pack does not
create reservations or send payouts.

| Field | Rule |
|---|---|
| `taskId` | Opaque (`bty_` + hex). Not a URL. |
| `termsVersion` | Immutable snapshot hash of title, reward, deadline, verification text, status, funding, prereqs. |
| `reward.amount` | Atomic decimal **string** + `asset` + `network`. Never a float. |
| `funding` | `unfunded` \| `reserved` \| `released` \| `unknown` |
| `contributorPublicId` | Public contributor id. **Not** the payout destination. |
| `payoutDestination` | Optional and separate. |
| `reservation` | At most one active, with expiry. Unknown unless a labelled overlay supplies it. |
| `submission` | Artifact ref + digest + media/bytes. Unknown unless overlay. |
| `verdict` | `pass` \| `fail` \| `needs_review` bound to task/reservation/terms/artifact/verifier version. Unknown unless overlay. |
| `payout` | `none` \| `owed` \| `queued` \| `submitted` \| `confirmed` \| `failed` \| `unknown` |
| `idempotencyKey` | One key: `taskId:termsVersion` unless overlay supplies another. |
| `dataLabel` | `fixture` \| `synthetic-edge` \| `live-capture` \| `derived` |

Silent divergence is forbidden. If a field cannot be observed, it is `unknown`, not invented.

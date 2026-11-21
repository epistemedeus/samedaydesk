# change-monitor

Scoped change receipts for one depended-on capability. A later caller can
consume a receipt, acknowledge it, and rerun the affected task.

An unchanged check is not a useful delivery. This package does not start a
resident scheduler, activate a paid subscription, publish a homepage, or send
to a URL supplied in subscription JSON.

The only writer is `packages/change-monitor/`. Release Gate 0.1.4 is loaded
from the pinned public archive. Route Lock is an envelope pin and is not
loaded. The observatory projection is the vendored S12 module.

## Install

The candidate archive is `change-monitor-0.1.0.tgz` in a checkout. It is not
served from a public URL yet.

```bash
mkdir -p /tmp/change-monitor-install
tar -xzf change-monitor-0.1.0.tgz -C /tmp/change-monitor-install
node /tmp/change-monitor-install/package/src/cli.mjs gate
node /tmp/change-monitor-install/package/examples/cold-install.mjs --dest /tmp/change-monitor-journey
```

`gate` checks out Release Gate `0.1.4` and runs `evaluateRelease` only when
the extracted files match that archive. A private `packages/release-gate`
tree is not used.

## Limitations

- An unchanged check is not a delivery. `delivered` is true only after the
  receiver accepts the event. Pending, failed, and unknown rows stay
  `delivered: false`. An unknown send is ambiguous: reconcile it, and do not
  POST that key again until the receiver reports it absent.
- `seed` changes one captured metric locally. The event is `capture: "seeded"`,
  `publicSourceChanged` is false, and `naturalCustomerDemand` is false.
- The Release Gate cache is files in the caller cache directory. A matching
  extraction is reused. A partial, symlinked, or edited tree is not the module
  that runs. This package does not start a daemon.
- Subscription JSON cannot name a destination URL. The CLI delivers only to
  an enrolled `127.0.0.1` or `localhost` receiver.
- `cost.billable` is false. There is no price, SKU, or paid subscription.
- `publicationStatus` stays `candidate` until the archive is deployed and an
  anonymous GET matches it.

## Flow

`subscribe`, then a comparable baseline, then later observations.

| Outcome | Outbox event | Budget |
| --- | --- | --- |
| `baseline_established` | no | no |
| `unchanged` | no | no |
| `content_changed` | yes, rerun | yes |
| `service_restored` | yes, rerun | yes |
| `evidence_unavailable` | yes, do not treat as content or zero | yes |

`missing`, `stale`, `incomparable`, and `source_failure` are evidence classes.
They are never stored as a zero metric and never as an ordinary content change.
Repeating the same non-comparable fingerprint is `unchanged`.

Event identity is a SHA-256 over subscription id, subscription revision, prior
baseline digest, evidence class, material digest, failure fingerprint,
transition, and an admission ordinal. The ordinal distinguishes a later
oscillation from a retry of the same admission. Concurrent consumers that
still see the same state compute the same id. The idempotency key is that id.

The accepted observation and the outbox row are one durable write. Delivery
happens after that write.

## Subscription

Required fields: `subscriptionId`, `owner`, `source.kind`, `source.scope`,
`comparison.policy` (`material-fields`), `destination.receiverId`,
`budget.maxUsefulEvents`, `expiresAt`.

`destination.receiverId` must already exist in the process receiver registry.
A `url`, webhook, or `http://` string in the subscription is rejected. The
shipped CLI dials only `http://127.0.0.1` or `http://localhost` with an
explicit port, and only the origin `/deliver` and `/events/:key` paths.

Scopes:

| Kind | Scope |
| --- | --- |
| `release-gate` | `release-gate:<subject>@<version>` |
| `route-lock` | `route-lock:decision:<bindingDigest>` |
| `source-projection` | `source-projection:moltjobs`, `x402stats`, or `smithery_mcp` |

`materialFields`, when set, must be a subset of that adapter's declared
fields. Narrowing them bumps the revision and clears the baseline. It does
not rewrite events already admitted. `sourceVersion` and `coverage` stay in
the compared material. Raising `maxUsefulEvents` bumps the revision and keeps
the baseline. Lowering it is rejected.

## Evidence adapters

Pins are in `PINS.json`. Release Gate and Route Lock versions below are the
packages on the admitted parent tip. The observatory projection pin is the
S12 commit recorded there.

- Release Gate `0.1.4`, schema `release-gate.receipt.v1`, via `evaluateRelease` from the public archive `release-gate-0.1.4.tgz` sha256 `f14eac0c4c10bba3f3d8b2e89d6eed1a87f47077bb06a7c70f96409ced9d7bef`. `packages/release-gate` is not imported.
  `generatedAt`, prose `reason`, and `originProof.awaiting` are non-semantic.
  Verdict, acceptance, surface state, launch, and origin proof status are material.
- Route Lock `0.1.0`, schema `route-lock.decision.v1`. `decide()` is not loaded.
  `evaluatedAt` is the decision clock (`packages/SOURCE-MATRIX.md`).
  `evidence.observedAt` is the observation clock. Missing `present` is class
  `missing`. `fresh: false` is class `stale`. A fresh decision compares
  decision, code, findings, six dimension statuses, terms, evidence digest,
  availability, and boundary flags.
- Observatory envelope `pilot.external-observatory.v1`. `fetchedAt` and the
  provider timestamp value are non-semantic. Unavailable, error, and missing
  rows do not become numeric zeros. Partial or undeclared coverage is
  `incomparable`. Comparable caller-supplied rows require
  `coverage.comparable === true` and `coverage.status === "complete"`.
- Maintained projection `pilot.external-observatory.source-projection.v1`,
  consumed from the exact S12 bytes pinned in `vendor/s12-observatory/`
  (`1d9e6eb50ded038acd9511bc689a23f2fbb15eac`). `page.js` is not included.
  One source is compared at a time. A fresh, covered slot is comparable.
  Stale, missing, failed, and partial-population readings keep `material`
  null. A kept-prior failure is `source_failure`, not a rewritten zero.
  `marketWideTraffic`, `combinedActivity`, and cross-source totals stay null.

`readMaintainedProjection()` performs one GET of
`https://samedaydesk.com/api/observatory/snapshot` and projects it with that
pinned module. It does not poll. A caller-supplied document is not labelled
`live`. `examples/unavailable-not-zero.json` is `capture: "fixture"`.
A seeded mutation is `capture: "seeded"` and sets `publicSourceChanged` false.
`publicSourceChanged` is true only when a later live fetch changes material.

Release Gate `0.1.4` is the consumed runtime. The public archive is fetched
and checked, then `evaluateRelease` runs only from a tree whose regular files
match that archive. An edited cache module is not executed. A usable
extraction already on disk is kept. Route Lock `0.1.0` stays an envelope pin
and is not loaded. `COLD-CONSUMER-CONTRACT.md` is the caller contract.

## Pause, cancel, expiry

All three stop new admission. Events already in the outbox stay deliverable
and reconcilable. Cancel and expiry are terminal: resume does not resurrect
them after restart. A cancel that races an observation cannot delete an
outbox row the observation already committed.

## Delivery and acknowledgement

A send records `dispatch_started` before the request leaves. A crash in that
window stays `unknown` and is not posted again until reconcile reports the key
absent. A redirect is `failed` / `redirect_refused` and is not followed.
`delivered` is true only for `accepted`. Every other state is
`delivered: false`.

Outcomes:

| Result | Recorded state |
| --- | --- |
| 2xx body with `accepted: true` and the same idempotency key | `accepted` |
| same, with `duplicate: true`, or HTTP 409 echoing the key | `accepted` |
| deterministic 4xx | `failed` |
| timeout, reset, 5xx, or a 2xx body that does not echo the key | `unknown` |

`unknown` stays unknown until reconcile. Reconcile `found: true` with the same
key becomes `accepted`. Reconcile `404` returns the row to `pending` so a
later send can retry. Reconcile does not promote `failed` to `accepted`.

Acknowledgement requires `accepted` delivery. A second ack does not rewrite
the first. A correction stores a new evidence row and, when the material
changed, a new event that names `correctsEvidenceId`. The earlier event body
and a failed delivery stay as they were.

## CLI

One shot. There is no `setInterval` loop.

```bash
node src/cli.mjs subscribe --state ./var/state.json --file examples/subscription.release-gate.json --receivers ./receivers.json --now 2026-09-30T12:00:00.000Z
node src/cli.mjs observe --state ./var/state.json --subscription rg-route-lock --file ./observation.json --now 2026-09-30T12:00:00.000Z
node src/cli.mjs fetch --state ./var/state.json --subscription moltjobs-maintained
node src/cli.mjs seed --state ./var/state.json --subscription moltjobs-maintained --from ./var/live-fetch.json --key marketplaceCompleted
node src/cli.mjs correct --state ./var/state.json --subscription moltjobs-maintained --evidence <evidenceId> --file ./var/live-fetch.json
node src/cli.mjs run --state ./var/state.json --subscription rg-route-lock --file ./observation.json --receivers ./receivers.json --deliver --now 2026-09-30T12:00:00.000Z
node src/cli.mjs reconcile --state ./var/state.json --receivers ./receivers.json
node src/cli.mjs ack --state ./var/state.json --event <eventId> --by <name>
node src/cli.mjs pause|resume|cancel --state ./var/state.json --subscription rg-route-lock
node src/cli.mjs revise --state ./var/state.json --subscription rg-route-lock --file ./patch.json --receivers ./receivers.json
node src/cli.mjs receipt --state ./var/state.json --subscription rg-route-lock
node src/cli.mjs fail --state ./var/state.json --subscription rg-route-lock --code source_unreachable
```

`fetch` is one public snapshot read for a `source-projection` subscription.
`seed` mutates one numeric metric of that captured projection through
`applySourceUpdate`. It does not fetch again. `correct` admits a replacement
document that names `correctsEvidenceId` and leaves the earlier event in place.
Restoring the live capture revokes the seeded value. `cancel` stops later
admission.

Cold install into a second directory, with a real loopback receiver and a
new process for each step:

```bash
node examples/cold-install.mjs --dest /tmp/change-monitor-cold
```

The copy contains this package only. It GETs public Release Gate `0.1.4` and
does not copy `page.js` or `packages/release-gate`. The journey subscribes to
`source-projection:moltjobs`, fetches the public baseline, ignores a
`fetchedAt`-only edit, keeps stale and unavailable rows off zero, seeds
`marketplaceCompleted`, delivers that one event to `127.0.0.1`, reads it from
a new process, corrects it, pauses, cancels, and refuses the next observation.

Exit `0` means the observation was classified. Exit `2` means the subscription
or receiver config was rejected. Exit `3` means admission was refused
(paused, cancelled, expired, or budget). Exit `4` means a delivery is still
`unknown`.

`examples/rejected-url-subscription.json` is a seeded rejection. It must exit 2.
`examples/unavailable-not-zero.json` is a fixture (`capture: "fixture"`), not
a live observatory row. Fed after a comparable baseline, it is
`evidence_unavailable` / `missing`, not `content_changed`.

Receiver contract, loopback only:

- `POST /deliver` with header `idempotency-key` and body
  `{ "schema": "change-monitor.delivery.v1", "idempotencyKey", "event" }`.
- `GET /events/<idempotencyKey>` returns `{ "found": true, "idempotencyKey", "event" }`
  or `404`.

## Cold consumer and usage

```bash
node examples/cold-consumer.mjs --state ./var/state.json --subscription rg-route-lock
node examples/cold-consumer.mjs --state ./var/state.json --subscription rg-route-lock --ack --by cold-consumer
```

`receipt` prints `change-monitor.usage-receipt.v1`. `cost.billable` is false,
`price` and `sku` are null, and `quantity` counts useful events only.

## Test

```bash
npm test
```

Node.js 22. No package install is required. The scenario tests start a
loopback receiver, deliver a real `evaluateRelease` receipt, and reopen the
state file.

Adapter extension is `EXTENSION.md`.

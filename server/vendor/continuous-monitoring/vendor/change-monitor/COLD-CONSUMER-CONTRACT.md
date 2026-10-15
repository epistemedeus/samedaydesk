# Cold consumer contract

A later agent can act on a change-monitor receipt without this repository.
The package is a candidate. It does not deploy itself, start a resident
poller, or send to a URL named in subscription JSON.

## What you can decide

| Receipt field | Decision |
| --- | --- |
| `transition: content_changed` or `service_restored`, delivery `accepted` | Rerun the affected task for that scope. Acknowledge only after the rerun. |
| `transition: evidence_unavailable` | Do not rerun and do not treat the row as zero. Coverage or freshness failed. |
| `outcome: unchanged` or `baseline_established` | No notification. An unchanged check is not a useful delivery. |
| `capture: seeded` | A labelled local mutation of a captured projection. `publicSourceChanged` is false and `naturalCustomerDemand` is false. It is not a natural public change and it is not customer demand. |
| `capture: live` and `publicSourceChanged: false` | The public snapshot was read. It did not move the compared material by itself. |
| `capture: fixture` | Caller-supplied. Not a live read. |
| `correctsEvidenceId` | A later row names the evidence it replaces. Keep the earlier event. |
| `delivered: false` | The receiver has not accepted the event. Admission, a pending row, a failed row, and an unknown send are not delivery. |
| `delivered: true` | The receiver accepted this event. Acknowledge only after the rerun. |
| delivery `unknown` | The send is ambiguous. Reconcile `GET /events/<idempotencyKey>` on the same loopback origin. Do not POST again until that probe says the key is absent. `delivered` stays false until that reconcile accepts the key. |
| delivery `failed` with `redirect_refused` | The receiver left the registered origin. Do not follow the redirect and do not add that URL. |
| `status: paused`, `cancelled`, or `expired` | Admission has stopped. Rows already in the outbox stay. |
| `cost.billable: false`, `price: null`, `sku: null` | Usage is a count of useful events. It is not an invoice and it does not start a paid subscription. |

`material` is null for missing, stale, partial, failed, and incomparable rows.
A numeric `0` inside a supplied document is not copied into `material` and is
not a content change. `marketWideTraffic`, `combinedActivity`, and cross-source
totals stay null.

Release Gate material comes from public archive `release-gate-0.1.4.tgz`
sha256 `f14eac0c4c10bba3f3d8b2e89d6eed1a87f47077bb06a7c70f96409ced9d7bef`
(16254 bytes) at `https://neomorphic.io/downloads/release-gate/0.1.4/release-gate-0.1.4.tgz`.
`packages/release-gate` is not imported. The running module is the extracted
archive only when every regular file matches those bytes. A partial cache, a
symlink, or an edited file with the same export names does not run.
`generatedAt` and prose `reason` do not notify. A verdict or surface change does.
A revoked or held receipt is evidence. It is not `launched` and not
`ownerPayment`. A purchase decision is rejected by the gate. A wrong archive
hash is rejected before `evaluateRelease` runs.

The projection pin remains commit `1d9e6eb50ded038acd9511bc689a23f2fbb15eac`,
`projection.js` sha256 `3a4559e2150694e61cc40868a37711b4f50496960234d337b8693bcfdcaceba4`.

## Operating cost

No SKU and no charge. The usage receipt counts checks and useful events.
A cold install records the public snapshot GET time and the Release Gate
archive size when the journey runs. Those measurements are observations of
this run, not a price.

## Install

From a checkout of the candidate archive:

```bash
mkdir -p /tmp/change-monitor-install
tar -xzf change-monitor-0.1.0.tgz -C /tmp/change-monitor-install
node /tmp/change-monitor-install/package/src/cli.mjs gate
node /tmp/change-monitor-install/package/examples/cold-install.mjs --dest /tmp/change-monitor-journey
```

Run each later command as its own process. `subscribe` opts in. `fetch` reads
one public snapshot. `seed` mutates that capture. `deliver` posts one event to
the enrolled loopback receiver. `correct`, `pause`, and `cancel` are separate
processes. There is no resident poller.

## Limitations

`public/downloads/change-monitor/0.1.0/` is a candidate. `publicationStatus`
stays `candidate`, `hostedAcquisitionVerified` stays false, and `launched`
stays false. Callers use the archive from a checkout. There is no public
install URL yet. Subscription JSON cannot carry a destination URL. The CLI
posts only to an enrolled loopback origin. No SKU is charged. A seeded row is
not customer demand. A natural public change is a later live fetch whose
compared material moved, with `capture: live` and `publicSourceChanged: true`.

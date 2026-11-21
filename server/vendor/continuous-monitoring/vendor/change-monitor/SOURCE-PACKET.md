# Source packet

Operation `S13-LIVE-COMPOSITION-093095`. Branch
`heavy/s13-change-monitor-0930`. Writer scope is
`packages/change-monitor/` only.

| Contract | Where |
| --- | --- |
| Injected clock, pure transition, durable store, delivery adapter | `src/clock.mjs`, `src/transition.mjs`, `src/store.mjs`, `src/deliver.mjs`, `src/service.mjs` |
| Opt-in subscription, no URL from subscription JSON | `src/subscription.mjs`, `examples/rejected-url-subscription.json` |
| Release Gate consumer | `src/consumers/release-gate.mjs` loads public `release-gate-0.1.4.tgz` sha256 `f14eac0c4c10bba3f3d8b2e89d6eed1a87f47077bb06a7c70f96409ced9d7bef` and calls `evaluateRelease`. It does not import `packages/release-gate` |
| Route Lock envelope consumer | `src/adapters/route-lock.mjs` reads `route-lock.decision.v1` and does not call `decide()` |
| PR219 compatibility | superseded by deployed Release Gate 0.1.4. The 0.1.0/0.1.3 pending claim is stale |
| Source projection | `src/consumers/source-projection.mjs` and `src/adapters/source-projection.mjs` |
| S12 maintained projection | exact bytes in `vendor/s12-observatory/`, commit `1d9e6eb50ded038acd9511bc689a23f2fbb15eac`, projection sha256 `3a4559e2150694e61cc40868a37711b4f50496960234d337b8693bcfdcaceba4`. `page.js` is excluded |
| Public input | one GET `https://samedaydesk.com/api/observatory/snapshot` via `fetch` |
| Seeded mutation | `seed` calls `applySourceUpdate` on the captured projection. `publicSourceChanged` stays false |
| Capture labels | `live`, `seeded`, `fixture`, `injected`, `caller-supplied` on evidence and events |
| Outbox before delivery, stable idempotency key | `applyObservation` writes evidence and event together; key equals `eventId` |
| Unknown send, reconcile, ack, correction | `src/service.mjs`, `src/transition.mjs`, CLI `correct` |
| Pause, cancel, expiry | admission stops; admitted rows stay |
| One-shot CLI | `src/cli.mjs` |
| Cold install | `examples/cold-install.mjs` copies this package into a second directory, GETs the public Release Gate 0.1.4 archive, starts `examples/loopback-receiver.mjs`, and uses a new process per step |
| Candidate download | `scripts/pack-change-monitor.mjs` writes `public/downloads/change-monitor/0.1.0/`. Status stays `candidate` until Root readback. The descriptor hash is the packed bytes, not an older candidate |
| Executable cache | `src/runtime/acquire-release-gate.mjs` runs `evaluateRelease` only from a tree whose regular files match the pinned archive. A matching `unpack/` or `bound/<sha256>/` tree is reused. This process deletes only a staging directory it created |
| Caller contract | `COLD-CONSUMER-CONTRACT.md` |
| Cold consumer and usage receipt | `examples/cold-consumer.mjs`, `src/usage.mjs` |
| Adapter extension | `EXTENSION.md` |
| Imported versions | `PINS.json`, `vendor/s12-observatory/PROVENANCE.json` |

Verify:

```bash
cd packages/change-monitor
npm test
node src/cli.mjs subscribe --state /tmp/s13-reject.json --file examples/rejected-url-subscription.json --receivers <loopback receivers file> --now 2026-09-30T12:00:00.000Z
node examples/cold-install.mjs --dest /tmp/change-monitor-cold
```

The subscribe command above exits 2. `npm test` includes the cold install
from a clean caller directory with no private `packages/release-gate` sibling.
The live fetch reports `publicSourceChanged: false`. The seeded change is a
separate `content_changed` event with `naturalCustomerDemand: false`.
`delivered` is false until the receiver accepts. A crash before send and a
crash after send leave the row `unknown` and do not replay the POST.
No paid subscription is activated.

## Operator receipt

This file is the operator record. Consumer install and use stay in
`README.md` and `COLD-CONSUMER-CONTRACT.md`.

QA for this package is `npm test` in `packages/change-monitor`. That run
packs the candidate, executes the cache probe from an empty directory, and
runs the public snapshot, seeded change, loopback delivery, restart,
correction, pause, and cancel journey.

Root publication is not part of this pack. Root deploys
`public/downloads/change-monitor/0.1.0/` and records an anonymous exact-byte
readback before `hostedAcquisitionVerified` can change. Until that readback
exists, the candidate hash in `descriptor.json` is the packed file only.
Release Gate 0.1.4 remains the release checklist. Do not add a resident
monitor in this package. A later hosted receiver, if one is added, needs a
new registry id and an explicit loopback allowlist. Subscription JSON still
cannot carry a destination URL.

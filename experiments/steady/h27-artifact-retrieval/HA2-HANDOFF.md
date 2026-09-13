# HA2 handoff — authenticated HTTP adapter over HA1 reader

HA1 persistence is ready. HA2 mounts metadata/artifact GET against an **injected** HA1 reader. Do not open SQL, edit D14, or change auth providers.

## Inject this object

```js
import { createFileStore } from "../tools/managed-useful-jobs-order/lib/store-file.mjs";
import { createPostgresStore } from "../tools/managed-useful-jobs-order/lib/store-postgres.mjs";
import { createAcquisitionService } from "../tools/managed-useful-jobs-order/lib/acquisition.mjs";

const service = createAcquisitionService({ store, artifactRoot: store.artifactRoot });
const reader = service.reader;
```

Writer/`admit` stay on the managed-order completion path. GET must not call `runCreateOrder`, `runPaidOffer`, settlement, `deliverOnce`, enqueue, or acknowledge.

## Binding

Trusted application authentication context supplies `principalId` (stable ID, never raw `Authorization` / bearer string / body field).

```
GET binding = {
  principalId,                 // from app auth
  executionId,                 // URL param, execution.v1 grammar
  requestHash,                 // X-Request-SHA256; version samedaydesk.acquisition-frozen-request.v1
}
openVerified adds { name, sha256 }  // promised basename + X-Artifact-SHA256
serverNow                          // injected trusted clock at the HTTP boundary
```

Do not treat HTTP `frozenIdentity()` hash as `requestHash` unless HA1 `hashesReconciled` was set for that versioned canonicalization. Managed-order `termsHash` is a different field.

## States → HTTP (from H21 declaration)

| Reader | HTTP |
| --- | --- |
| `available` | 200 JSON / 200 octet-stream |
| `pending` | 202 |
| `not-found` (missing or **other principal**) | 404 — do not leak that the id exists |
| `identity-conflict` (same principal, wrong hash/receipt/output) | 409 |
| `expired` | 410 |
| `integrity-failed` | 422 |
| oversize | 413 |
| Range | 416 (HA2; HA1 has no Range API) |
| store unavailable | 503 |

`purchaseAuthority` and `sold` are always false. Private, `no-store`, `nosniff`, attachment, `application/octet-stream`. No redirects, no CDN, no caller-chosen roots.

## Tests HA2 still owes

Path/race/bounds at the HTTP layer, abort of the socket, spies that GET does not touch engine/payment/outbox, 404 vs 409 split above. HA1 already covers durable restart, PG, tombstones, hostile files, and known-bad missing seam.

Suggested exclusive files: `server/paid-useful-jobs/lib/acquisition-http.mjs`, `lib/http.mjs`, `bin/serve-execution.mjs`, `tests/acquisition-http*.test.mjs`.

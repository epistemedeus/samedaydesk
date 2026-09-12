# H01 / Root integration seam

Apply after the current merchant release at
`a143898dd1ec35c097ca7eb0b472f30dad1ee319` closes. D17 does not edit the
merchant repo.

## Do not change

1. Keep writing v1 paid-success rows with `validatorVerdict: not_checked`,
   `validatorAuthority: none`, `validatorSource: http_runtime_not_checked`.
2. Keep hashing response bytes at `res.write`/`end` time with domain
   `samedaydesk.commerce-paid-success-evidence.response.v1\0`.
3. Keep `isCanonicalPaidSuccessEvidence` accepting historical `not_checked`.
   If verdict vocabulary grows, version the record (`v: 2` or a sibling
   file). Do not make the v1 predicate compare against a new constant that
   would drop old rows.
4. Do not treat MCP typed telemetry as HTTP extract identity.
5. Do not add a second revenue ledger or set `buyerValidOutput` from schema
   pass.

## Add (merchant, H01)

After `finishPaidEvidenceResponseDigest()` and the v1 append, optionally
append a sibling NDJSON file using this package:

```js
import { recordFromObservedResponse, openStore } from
  "samedaydesk/experiments/wave5/d17/http-delivery-evidence/src/index.mjs";

const record = recordFromObservedResponse({
  method: "GET",
  resource: "/extract",
  responseBytes: callerObservedBuffer,
  merchantHttpStatus: res.statusCode,
  settlementClass: "real_unverified", // never "simulated" in production
  settlementReference: settlement?.reference || null,
  payerClass: paidEvidence.payerClass,
});
await openStore(dataDir).appendValidation(record);
```

`callerObservedBuffer` must be the same bytes already hashed into
`responseDigest`, not a later file reread.

## Root readout

Join `commerce-paid-success-evidence.ndjson` to
`http-response-validation.v1.ndjson` with `joinKey(method, route, responseDigest)`.

A next real paid GET /extract then yields:

- chain hash (v1 `settlementReference`) if the facilitator returned one
- retained `responseDigest` from the live bytes
- `deliveryClass` from the declared contract
- `usefulness: unknown` until a separate buyer-attested source exists
- `payerClass: unclassified` until a classified payer map says otherwise

Simulated facilitator tests stay `settlementClass: simulated` and are not
banked revenue. The existing four production purchases remain paid HTTP with
`not_checked` until this seam is live; do not backfill private bodies.

# W5-M12 selected-offer description

**Schema:** `samedaydesk.wave5.m12.offer.v1`  
**Offer id:** `sdd.useful-jobs.supplied-input` (stable string, not a catalog array index)

Thin consumer of SDS52 `server/paid-useful-jobs`. This package does not reimplement
the wrapper or the useful-jobs engines.

## Invoke

From the repository root, Node >= 22, no extra install:

```bash
node experiments/wave5/m12/bin/describe.mjs
node experiments/wave5/m12/bin/verify.mjs
node experiments/wave5/m12/bin/verify.mjs --description /tmp/offer.json
```

Library:

```js
import {
  OFFER_SCHEMA,
  loadSources,
  describeSelectedOffer,
  verifyOfferDescription,
  createOfferServer,
  listenOfferServer,
} from "./index.mjs";
```

Loopback HTTP (offer document only, not D01 execution HTTP):

- `GET /health` → `{ ok, schema, offerId, liveSettlement }`
- `GET /offer` → the description JSON

```bash
node experiments/wave5/m12/bin/serve.mjs
```

## Description fields

| Field | Meaning |
| --- | --- |
| `jobIds` / `jobsById` | Selected jobs keyed by stable id. Order is not identity. |
| `prices.selected` | Free offline useful-jobs, non-live wrapper fixture `0.02`, optional D26 proposed row |
| `prices.adjacentLive` | Existing extract `$0.005` and seller-integrity-audit `$0.01`. Not this offer. |
| `limits.maxInputBytes` | `1048576`, enforced by the wrapper |
| `identities.catalogSha256` | Bytes of `catalog.json` |
| `identities.archiveSha256` | Engine archive identity. Different document. Not forced equal. |
| `bindings.m01` / `d26` / `d01` | `bound` or `unbound` on the tested pin |

## Sibling files (consumed, not owned)

| Path | Schema | When absent |
| --- | --- | --- |
| `experiments/wave5/m01/selected-offer.json` | `samedaydesk.wave5.m01.selected-offer.v1` with `jobIds` | SDS52 catalog is the selected set |
| `experiments/wave5/d26/cost-floor.json` | `samedaydesk.wave5.d26.cost-floor.v1` with measured costs and `proposedPriceUsdc` | No proposed live price is advertised |

Override paths with `W5_M01_SELECTED` and `W5_D26_COST`.

## Tests

```bash
cd experiments/wave5/m12 && node --test --test-concurrency=1 test/*.test.mjs
```

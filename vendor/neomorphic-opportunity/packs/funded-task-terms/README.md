# Funded-task terms (F17)

Typed, tested **terms schema and validator** for funded tasks. Own directory so F01 (earned-work / reservation) and F04 (walletless payout ledger) can depend on this pack without owning it.

This pack does **not** pay, deploy, price, hold secrets, fetch artifacts, or launch artifact code.

## Import (stable API)

```ts
import {
  parseTerms,
  assertTerms,
  hashTermsVersion,
} from "@neomorphic/funded-task-terms";
```

In this repository, until a workspace pin exists:

```ts
import {
  parseTerms,
  assertTerms,
  hashTermsVersion,
} from "../funded-task-terms/src/index.ts";
```

JSON Schema: `schema/funded-task-terms.v1.json` (also exported from the package).

## `termsVersion`

**Kind: content hash, not an integer.**

`termsVersion` is `sha256:` plus 64 lowercase hex characters. It is the SHA-256 of the canonical JSON body of the terms document **with `termsVersion` omitted**. `schemaVersion` is the integer shape version (`1`). Do not mutate a hashed terms blob to record ledger transitions — F04 should store `fundingState` changes outside this document.

## User journey

```sh
cd packs/funded-task-terms
npm ci
node bin/validate.mjs fixtures/golden/complete.terms.json
```

The validator prints JSON with `termsVersion` and `canonicalHash` (the same value).

```sh
npm test
npm run typecheck
```

## Honesty

- Never launch external artifact code in a credentialed worker. `artifact` is `{ ref, digestSha256, mediaType, bytes }` metadata. Execution-hint fields (`executablePayload`, `command`, …) are rejected.
- An LLM verdict alone is not authority to transfer funds (`fundTransferAuthority.llmVerdictAlone` must be `false`; requester accept is required).
- `paymentTiming.railMayPay` is always `outside_this_pack`.
- No deployment, payment rail, price feed, or secrets.

S275 DESIGN was not on this checkout. `services/earned-work/` is absent, so this pack **is** the package F01 should import rather than forking a second schema. See `FEATURE-MAP.md`.

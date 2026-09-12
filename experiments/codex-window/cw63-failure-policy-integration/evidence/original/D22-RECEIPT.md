# W5-D22 RECEIPT — Co07 refund-policy projection

SDS-local read-only projector. Explicit policy plus job facts. Operational
error does not invent `not-offered`. 8.105 USDC is not a job dossier field.

Owned paths: `tools/refund-obligation-projector/`, `experiments/wave5/d22/RECEIPT.md`.
Integration owner: W5-D01.
HEAD: `ab93e2517be74442d4d6ab7bc7f62fccf2e0ebc9`.

## Interface

```sh
node tools/refund-obligation-projector/bin/project.mjs --pretty
node tools/refund-obligation-projector/bin/project.mjs --operation-id agent402-external-validation-purchase-2026-08-29
node tools/refund-obligation-projector/bin/project.mjs --policy tools/refund-obligation-projector/fixtures/policy/agent402-not-offered.json
cd tools/refund-obligation-projector && npm test
```

## Current-source finding

At starting pin `f19a021a82a4ff59fd3b510fda11e603e6885686`,
`classifyRefundClaim` mapped `repair_required` / `intake_required` to
`not-offered`, and every projection included `citedBankedUsdc: "8.105"`.
That is the Co07 defect. It is reproduced and fixed in this package.

## Tests

`cd tools/refund-obligation-projector && npm test`

**31 pass, 0 fail, 0 skipped.** Node v22.14.0. Includes real CLI, `GET /projection` and `GET /projection?operationId=`, and disposable PostgreSQL 16 (`initdb`/`pg_ctl`/`psql`). Postgres is a required gate, not a skip.

## Tested pins

- D13 ledger shape: `aa306e291adfdd499ca971af01625ccc4bfee5c4` (`samedaydesk.buyer-value-ledger.v1`). Remaining: Wave5 D13 may amend the ledger. This projector does not claim that future behavior.
- PR52 receipt: `aeef964fa188443078958d9d6d393afae1d542ee` (`engineResult.ok` / `refused`). Remaining: D01 owns the wrapper.
- I01 hash terms: kind check only. `hashTermsVersion` is not imported.

## Stops

No default-branch push, deploy, purchase, payout, or customer messages.

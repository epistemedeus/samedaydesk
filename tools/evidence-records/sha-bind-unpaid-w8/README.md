# sha-bind-unpaid-w8 — SDS unpaid evidence bound to committed SHA-256

Owned path: `tools/evidence-records/sha-bind-unpaid-w8/**` (BOTWAVE-sds3-X178).

Week-8 unpaid SameDayDesk evidence is accepted only when it is bound to the
SHA-256 of a committed artifact. HTTP 402, buyer-runtime stop/discover, the
x402 catalog snapshot, unpaid traffic records, and the unpaid MCP tool
inventory are pins. A matching unpaid label with the wrong digest is
`sha_mismatch`. Stripe events, facilitator settlements, and banked transaction
hashes cannot be labeled unpaid.

This pack does not collect live analytics, call a facilitator, or change
Stripe objects.

## Cold pins

| bindId | committed artifact |
| --- | --- |
| `sbu_w8_extract_402` | `fixtures/verified-feed/observations/extract-current.json` (HTTP 402 `/extract`, 5000 atomic USDC) |
| `sbu_w8_agent402_stop` | `fixtures/buyer-runtimes/agent402/states/stop.json` |
| `sbu_w8_coinbase_x402_stop` | `fixtures/buyer-runtimes/coinbase-x402/states/stop.json` |
| `sbu_w8_agent402_contract` | `fixtures/buyer-runtimes/agent402/states/contract.json` |
| `sbu_w8_agent402_discover` | `fixtures/buyer-runtimes/agent402/states/discover.json` |
| `sbu_w8_x402_catalog` | `fixtures/presence/catalog/x402.json` |
| `sbu_w8_operator_validation` | `tools/evidence-records/fixtures/valid/operator-validation.json` |
| `sbu_w8_indexnow_receipt` | `tools/evidence-records/fixtures/valid/indexnow-receipt.json` |
| `sbu_w8_bazaar_listing` | `tools/evidence-records/fixtures/valid/bazaar-listing.json` |
| `sbu_w8_mcp_tool_inventory` | `server/lib/mcp-tool-inventory.js` plus frozen tools-block sha `068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf` |

## Commands

```bash
# Cold bind of committed unpaid artifacts — exit 0
node tools/evidence-records/sha-bind-unpaid-w8/cli.mjs --cold

# Designated seeded failure: unpaid extract 402 with a flipped digest — exit 1
node tools/evidence-records/sha-bind-unpaid-w8/cli.mjs --seeded-failure sha-mismatch

# Named reject on that seed — exit 0 (the reject was caught)
node tools/evidence-records/sha-bind-unpaid-w8/cli.mjs --expect-reject sha_mismatch \
  tools/evidence-records/sha-bind-unpaid-w8/fixtures/invalid/sha-mismatch.json

# Tests
node --test tools/evidence-records/sha-bind-unpaid-w8/test.mjs
```

`--live` / `--pay` / `--payment` / `--checkout` / `--publish` / `--stripe` /
`--settle` / `--neo` / `--neo-kernel-vendor` are refused (exit 2).

## Seeded failure

`fixtures/invalid/sha-mismatch.json` copies the unpaid `/extract` 402 pin and
flips the last hex nibble of the declared SHA-256. Naive verdict is accept
(`statusClass: unpaid`). Honest verdict is reject (`sha_mismatch`).

```
node tools/evidence-records/sha-bind-unpaid-w8/cli.mjs --seeded-failure sha-mismatch
# EXIT 1  error.code SEED_REJECT
# codes: ["sha_mismatch"]
```

## Layout

```
cli.mjs                 JSON CLI
lib.mjs                 SHA bind + unpaid policy
test.mjs                node:test
README.md
schema/sha-bind-unpaid.w8.v1.json
fixtures/catalog.json   pins, paid-refuse paths, designated seed
fixtures/valid/*.json
fixtures/invalid/*.json
fixtures/invalid/manifest.json
```

No payment, checkout, publish, or Stripe.

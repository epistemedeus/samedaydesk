---
name: transaction-receipt
description: Inspect a mined Base or Ethereum transaction through a normalized public receipt. Use for success or revert status, block identity and time, gas use, effective gas price, total transaction fee, decoded ERC-20 Transfer events, canonical USDC transfer evidence, or distinguishing a missing receipt from an unavailable RPC. This is read-only chain evidence, not settlement-claim verification or transaction execution.
---

# Inspect a transaction receipt

Call:

`GET https://agents.samedaydesk.com/chain/transaction-receipt`

Supply:

- `transactionHash`: required 32-byte EVM transaction hash;
- `network`: optional `base` or `ethereum`, default `base`.

Read the current operation, response schema, and price from
`https://agents.samedaydesk.com/openapi.json` before payment. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and paid
retry.

## Validate before payment

Reject malformed hashes and unsupported networks before payment. On HTTP 402,
verify the complete route-bound resource, current amount, `eip155:8453` payment
network, canonical Base USDC asset, and recipient. The selected receipt network
may be Ethereum while payment still settles in Base USDC. Pay only with
separate caller authorization through x402 v2 or MPP `evm/charge`. Replay the
identical method and query and reconcile the protocol receipt.

## Interpret the result

- `found` means a public mined receipt was normalized. Read transaction status,
  block identity and time, gas fields, fee, decoded transfers, and findings.
- `not_found` means the selected public RPC returned no receipt. It does not
  prove that a transaction will never appear or that the hash belongs elsewhere.
- `rpc_unavailable` means the evidence could not be retrieved. Treat it as
  unknown and retry through policy rather than as success or failure.

Use `canonicalUsdcTransfers` for decoded transfer evidence only. To verify an
exact claimed Base-USDC payer, recipient, and amount, use the separate
`settlement-proof` skill. Preserve the transaction hash, requested network,
checked time, block evidence, findings, and the product payment receipt.

Verify the returned boundary excludes raw logs, private merchant ledgers,
wallet access, signing, broadcasting, transaction modification, custody, and
execution. A successful receipt does not prove service delivery, buyer intent,
revenue ownership, or business-accounting correctness.

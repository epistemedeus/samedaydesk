---
name: settlement-proof
description: Verify or reconcile a claimed canonical Base USDC payment against its successful public transaction receipt. Use for post-settlement x402 or MPP audits, marketplace earnings or spend claims, payment-receipt reconciliation, exact payer-recipient-amount checks, and diagnosing a platform counter that may not match on-chain settlement.
---

# Verify a Base USDC settlement

Call:

`GET https://agents.samedaydesk.com/commerce/settlement-proof`

Supply these query parameters:

- `transactionHash`: exact Base mainnet transaction hash;
- `recipient`: expected canonical Base USDC recipient;
- `amountAtomic`: expected positive USDC amount in six-decimal atomic units;
- `payer`: optional expected USDC payer.

Read the current operation, response schema, and price from
`https://agents.samedaydesk.com/openapi.json` before payment. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and paid
retry.

## Validate before payment

Require a 32-byte transaction hash, valid EVM addresses, and an exact positive
atomic amount. Keep the audited network fixed to Base mainnet and the asset fixed
to canonical Base USDC. Do not convert a decimal display amount with floating
point arithmetic.

On HTTP 402, validate the complete route-bound SameDayDesk resource, amount,
`eip155:8453` network, canonical Base USDC asset, and treasury recipient. Pay
only with separate caller authorization through x402 v2 or MPP `evm/charge`.
Replay the identical method, path, and sorted query. Reconcile the protocol
receipt for this product call separately from the transaction being audited.

## Interpret the result

Accept `decision=verified` only when:

- the transaction receipt is successful;
- exactly one canonical Base USDC transfer matches the expected recipient and
  atomic amount;
- the payer also matches when supplied;
- the receipt block and timestamp are available;
- `settlement.verified` is true and `findings` is empty.

Treat `not_verified` as a failed settlement claim. Use the finding code to
distinguish an unsuccessful transaction, missing recipient transfer, amount
mismatch, payer mismatch, duplicate exact transfer, or missing block evidence.
Treat `receipt_unavailable` as unknown, not as proof of failure or success.

Preserve the transaction hash, request binding, block number, block timestamp,
observed exact transfer, findings, and the payment receipt for downstream audit.
Do not infer service delivery, buyer intent, revenue ownership, or accounting
correctness beyond the exact on-chain transfer this result verifies.

Verify that the returned boundary states the tool read only public Base receipt
and log data, read no private merchant ledger, accessed no wallet, modified no
transaction, and authorized no execution.

---
name: wallet-enrich
description: Profile a Base or EVM wallet or contract address with deterministic public-chain evidence. Use to distinguish EOA from contract, inspect native and curated token holdings, decode token or NFT metadata, detect EIP-1967 proxies, check activity, resolve a forward-confirmed Basename, or size up an address before another transaction. The output is evidence, not a safety guarantee.
---

# Profile a wallet or contract

Call:

`GET https://agents.samedaydesk.com/wallet-enrich?address=<0x-address>`

Require a 20-byte EVM address. Read the current operation, response contract,
and price from `https://agents.samedaydesk.com/openapi.json`. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and replay.

On HTTP 402, verify the complete resource, amount, `eip155:8453` network,
canonical Base USDC asset, and recipient. Pay only with caller authorization
through x402 v2 or native MPP `evm/charge`. Preserve the source header and
reconcile the protocol receipt.

Use `type`, `native`, `tokenHoldings`, `contract`, `activity`, `basename`, and
`profile` as bounded evidence. Curated-token absence does not prove that every
token balance is zero, and activity does not establish ownership or safety.

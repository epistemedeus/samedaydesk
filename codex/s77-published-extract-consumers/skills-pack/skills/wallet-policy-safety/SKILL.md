---
name: wallet-policy-safety
description: Evaluate delegated-wallet, embedded-wallet, or agent-signer policy evidence without sharing credentials or raw provider payloads. Use to test exact approved-action shape, duplicated calls, authorization drift, replay, sequential cumulative caps, signed-but-unbroadcast accounting, ABI extraction, concurrent oversubscription, counter references, or application serialization before funding an autonomous wallet.
---

# Evaluate wallet-policy safety

Separate two questions:

- exact-action conformance asks whether one approved operation can drift in
  authorization, route, challenge, chain, contract, recipient, amount,
  function, call count, order, or replay;
- stateful-budget conformance asks whether prior or concurrent requests affect
  cumulative enforcement correctly.

Do not infer either answer from a provider feature label. Run bounded provider
tests first, reduce each result to a standardized observation, then evaluate the
portable matrix locally or through SameDayDesk.

## Keep the provider test bounded

Use an empty test wallet and sign-only requests where the provider supports
them. Fix the operation, network, token or program, recipient, atomic amount,
function, batch shape, validity window, and protocol before testing one drift at
a time. Avoid mainnet funding, broadcasts, customer funds, custody, leverage,
and unrestricted signers.

Persist only the standardized case name, `allowed`, `denied`, or `error`, the
enforcement class, and an optional short safe code. Exclude API keys, wallet and
resource IDs, counter values, signatures, transaction bodies, provider error
messages, raw responses, and recipient addresses.

Provider SDK validation and generic provider errors are inconclusive. Credit a
provider-native control only when the provider policy explicitly denies it.
Keep application serialization separate from provider enforcement.

## Build the observation matrix for free

Read the current contract before constructing input:

- exact action:
  `GET https://agents.samedaydesk.com/schemas/wallet-policy-conformance-v1.json`
- stateful budget:
  `GET https://agents.samedaydesk.com/schemas/stateful-wallet-policy-conformance-v1.json`

Alternatively install `agent-payment-policy` and use its credential-free local
CLI:

```bash
npx agent-payment-policy wallet-policy-init profile provider network protocol
npx agent-payment-policy wallet-policy-check observations.json

npx agent-payment-policy stateful-policy-init profile provider network protocol
npx agent-payment-policy stateful-policy-check observations.json
```

The local evaluator uses no network or wallet and makes no payment.

## Use the machine evaluator

Read the live POST operation, response schema, and current price from
`https://agents.samedaydesk.com/openapi.json`.

Choose exactly one route:

- `POST /security/wallet-policy-conformance` for exact-action observations;
- `POST /security/stateful-wallet-policy-conformance` for cumulative and
  concurrent observations.

Send `Content-Type: application/json` and optionally
`X-SameDayDesk-Agent-Source: agent-skills-v1`. The source label is declared
attribution only and cannot change price, access, or output.

The server rejects unsupported, secret-like, nested evidence, raw payload, and
duplicate case fields before payment. On HTTP 402, validate the identical POST
route and canonical JSON body binding, current amount, `eip155:8453` payment
network, canonical Base USDC asset, and recipient. Pay only with separate caller
authorization through x402 v2 or native MPP `evm/charge`. Replay the identical
method and canonical JSON body and reconcile the protocol receipt.

## Interpret the result

- `conformant`: every required case was explicitly observed and safely
  enforced under the evaluator's rules;
- `partial`: required cases are missing or inconclusive, without an observed
  unsafe allow;
- `unsafe`: at least one standardized unsafe action was allowed.

For stateful profiles, require `strictBudgetPassed=true` before claiming strict
cumulative control. A sequential denial does not offset an ABI extraction gap
or concurrent oversubscription. An application mutex or queue can be useful,
but it receives only application credit.

Treat the result as evidence about the submitted observations, not proof that
the provider test was honest or complete. Bind production execution separately
with per-action limits, exact signing-action authorization, replay prevention,
application serialization where needed, and post-settlement reconciliation.
Preserve provider-test evidence and the evaluator receipt without publishing
sensitive identifiers or raw provider material.

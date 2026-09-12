# Adoption

**Use `examples/customer-x402` @ merchant 1.23.48 for agents that already have a wallet.**
That is the only exercised path that is both a maintained x402 client *and* an
ordinary-agent recipe: unpaid inspect, exact `{before,after}` bytes, explicit
`--approve`, payment-identifier, one signed send, attempt-receipt, read-only
reconcile. Demonstrated locally (fake facilitator, throwaway signer) and live
unpaid (402 / 5000 atomic).

**Official `@x402/fetch@2.25.0` can transport the POST** (Request.clone keeps
body bytes) but is not a drop-in ordinary-agent recipe: it auto-pays on 402, has
no `--approve` / attempt-receipt / reconcile, and **without** the official
`@x402/extensions` payment-identifier enricher the lockfile seller returns
`400 payment_identifier_required`. `recovered` can create a second payload.
Do not point it at production with a funded wallet from this packet.

**`@agentcash/discovery@1.7.5` is the fundless inspection path.** `discover`
lists `POST /lockfile-pin-delta` at 0.005 USDC x402-only. JS `check` with a
valid lockfile body reproduces live 402 terms (5000 / Base USDC / live payTo).
Empty `{}` is 400. CLI `check` has no `--body`. This package cannot pay.

Agent402 remains a catalog/router with a settlement floor; it is **not** a
payer for this offer. Do not invent a wrapper to claim otherwise.

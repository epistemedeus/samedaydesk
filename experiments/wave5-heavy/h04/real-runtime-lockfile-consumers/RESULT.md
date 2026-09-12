# RESULT — ordinary clients vs POST /lockfile-pin-delta

Merchant pin `7aaf00410900dc41fb523d1b7b4469b40ded7981` / **1.23.48**. Live unpaid
402 observed. No live payment. Local paid proofs: fake facilitator + throwaway
signer.

## Matrix

| Client | Pin | Inspect | Pay (local) | Body bind | Amount cap | Reconcile | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| customer-x402 | 7aaf004 / @x402/* 2.16.0 | yes (`--approve` off) | yes, `--approve` | yes | yes (4000 cap refuses 5000) | yes (attempt-receipt) | **Adopt this** |
| @x402/fetch | 2.25.0 | plain fetch only | yes if payment-identifier extension registered | yes (`Request.clone`) | spend-control `$1` default, not exact 5000 bind | no; `recovered` may second-sign | stock fetch without extension → 400 |
| @agentcash/discovery | 1.7.5 | yes (`discover` + JS `check` with body) | **no** | n/a | n/a | n/a | empty `{}` → 400; CLI check has no `--body` |

Agent402: not exercised as a payer (settlement floor). Classified unsupported here.

## Cases

| Case | Evidence |
| --- | --- |
| invalid body | live HTTP 400 `charged:false`; local same |
| signed-body binding | customer-x402 and official fetch paid retry body === authorized bytes |
| price change | customer-x402 amountCapAtomic 4000 refuses live 5000 before wallet |
| unknown outcome | customer-x402 timeout 503, settle 0, no new payment |
| replay-negative | same payment-signature + different body → 409, settle unchanged |

`npm test` → **7 pass, 0 fail**.

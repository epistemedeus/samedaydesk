# S100 RESULT — native skill consumers (2026-09-10)

## Verdict
**16/16 accepted** independent fresh-context Grok 4.6 xhigh native consumers over published gateway skills PR2, using unpaid discovery / 402-stop and owner-qa deterministic merchant fixtures only. Paid endpoints and signing stayed disabled. No Pilot/Neo private inputs.

## Pins
- Skills merge: `82d0f019713c7223898806144da08fdbeed5c666`
- Merchant master: `8104629651fb31ea9fd4873de0017fa36b8bb0da`
- Gateway: `https://agents.samedaydesk.com`

## Publish scope
- Skills repo push from this VM returned **403**; harness + sanitized evidence published on SameDayDesk branch `codex/s100-native-skill-consumers-20260910`.
- S95 / dashboard bid unchanged (no rebid).

## Capacity experiment
| Cohort | Cases | Peak grok procs | MemAvailable at admit | free after 25% reserve | PSI |
|---|---:|---:|---:|---:|---|
| C1 initial | 9 | 11 | ~11.2 GiB | ~7.0 GiB | 0 |
| C2 useful growth | +3 | 3 | ~11.2 GiB | ~7.0 GiB | 0 |
| C3 useful growth | +4 | 4 | ~11.2 GiB | ~7.0 GiB | 0 |

Grew by useful outcome families (not arbitrary +3). Prior 25 is a lower bound; this run covers all 16 published skill folders with distinct native journeys.

## Acceptance matrix (compact)
Live unpaid / 402-stop: catalog purchase intent, extract, payment-offer-preflight, opportunity-preflight, agent-discoverability-audit, agent-surface-budget-audit, deep-audit, morpho-risk.

Owner-qa fixtures (labeled): company-enrich, contract-search secret refuse, repo-scan, schema-generate, settlement-proof (+malformed refuse), wallet-policy free path (+secret refuse), transaction-receipt (+unsupported network), wallet-enrich (+invalid address).

## Latency (ms)
catalog 167499, extract 101617, payment-offer 285564, company 99615, contract-refuse 51413, repo 111168, schema 110003, settlement 162759, wallet-policy 73185, receipt 104072, wallet-enrich 140666, opportunity 144384, discoverability 80511, surface-budget 91896, deep-audit 252879, morpho 102812.

## Usage
- Interactive weekly `/usage` TUI: **unavailable** headless (os error 6).
- Aggregated native session usage (`grok usage <session>` × 16): input 6,516,577 · output 101,171 · cachedRead 4,688,128 · reasoning 59,045 · total 6,617,748 · modelCalls 148 · subscription accounting ≈ $1.12 ticks (no API-key charges; paid gateway calls = 0).

## Product tips (exact)
1. Hosted `payment-offer-preflight` itself may return HTTP 402; cold consumers correctly stop — skill text already states hosted preflight can be priced separately from target inspection.
2. `deep-audit` live path is `GET /deep-audit` (not `/audit/deep-audit`).
3. Owner-qa consumers must run the fixture CLI; acceptance rejects missing `ownerQa` / `owner-qa-deterministic-fixture` labels.
4. Acceptance windows for payment headers must stay tight — skill docs mentioning `PAYMENT-SIGNATURE` are not payment.

## Evidence tips
- Sanitized artifacts + per-case acceptance under `evidence/`.
- No private packets, transcripts, or inherited prompts in the public tree.
- Re-run: `S100_MERCHANT_DIR=... S100_STATUS_DIR=... node consumers/native-s100/run-harness.mjs`.

## Process hygiene
No idle Grok TUIs/polls left; harness children exited; no local console watchers.

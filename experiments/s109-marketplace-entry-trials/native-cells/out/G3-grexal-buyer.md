# G3 — Grexal buyer/economics worksheet

Cell: independent buyer/economics, S109 Stage-1 Grexal per-run agent.
Cash boundary: **$0**. This worker did not login, signup, push, publish, top up credits, invoke a paid run, or call SameDayDesk paid routes.

As of: 2026-09-10. Primary citation: [Payments](https://docs.grexal.ai/docs/payments) (live re-fetch same day; matches `fixtures/grexal-payments.txt`).

## New fact

A buyer can validate this agent’s I/O schema from vendored `grexal.json` and replay `agent/pack_evidence.js` on a supplied unified diff with `paidModelCalls=0`, **without paying**. Grexal’s take is the published clamp on `buyer_charge`. SameDayDesk evidence tools stay upstream and separately licensed.

## 1. Fee formula (show floor and cap)

```
platform_fee  = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)
your_earnings = buyer_charge − platform_fee
```

Implemented as `min(max(20%, $0.02), 30% of charge)`.

| Guardrail | Value | When it binds |
| --------- | ----- | ------------- |
| Nominal rate | 20% | `buyer_charge ≥ $0.10` (seller keeps exactly 80%) |
| Floor | **$0.02 / run** | `~$0.0667 ≤ charge < $0.10` |
| Cap | **30% of charge** | `charge < ~$0.0667` (protects the buyer when the floor would exceed 30%) |

Crossover arithmetic (not a separate docs row): floor `$0.02` exceeds 20% below `$0.02 / 0.20 = $0.10`, and exceeds the 30% cap below `$0.02 / 0.30 ≈ $0.0667`. When floor > cap, the clamp’s outer `min` selects the **cap**.

Docs also: no separate sandbox/build/listing bill; seller still covers own LLM/API spend; buyer pays the listed price (no surcharge on top); run reserve is `estimate × 1.25`; self-runs and failed runs do not earn.

Recompute:

```bash
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs 0.18
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs 0.05
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs 0.08
```

## 2. Worksheet — $0.18 run (docs Claude example)

Docs backsolve for a *different* agent: target net `$0.10` + Claude `~$0.04` → `($0.10 + $0.04) / 0.80 = $0.175` → round to **`$0.18`**. **Not this packager’s list price** (`paidModelCalls=0`).

| Component | USD | Notes |
| --------- | ---: | ----- |
| Buyer pays | 0.18 | listed run charge |
| 20% nominal | 0.036 | `0.18 × 0.20` |
| Floor | **0.02** | does not bind (`0.036 > 0.02`) |
| 30% cap | **0.054** | `0.18 × 0.30`; does not bind (`0.036 < 0.054`) |
| **Platform fee (Grexal)** | **0.036** | clamp → 20% |
| **Seller earnings** | **0.144** | `0.18 − 0.036` |
| Effective fee | 20% | binding: `nominal-20pct` |
| Buyer reserve (`× 1.25`) | 0.225 | docs budget hold at run start |

## 3. Worksheet — $0.05 micro-run (cap binds)

Docs table row. This is the micro-run the prompt asks to show with floor **and** cap.

| Component | USD | Notes |
| --------- | ---: | ----- |
| Buyer pays | 0.05 | listed run charge |
| 20% nominal | 0.010 | `0.05 × 0.20` |
| Floor | **0.02** | would be 40% of charge if applied |
| 30% cap | **0.015** | `0.05 × 0.30` |
| Unconstrained `max(20%, floor)` | 0.02 | floor > 20% |
| **Platform fee (Grexal)** | **0.015** | `min(0.02, 0.015)` → **cap wins** |
| **Seller earnings** | **0.035** | `0.05 − 0.015` |
| Effective fee | 30% | binding: `cap-30pct` |
| Buyer reserve (`× 1.25`) | 0.0625 | |

The floor is **shown** (`$0.02`) but **does not apply**. The cap exists so a two-cent floor cannot take 40% of a five-cent run.

## 4. Floor band (derived) — $0.08 so the floor is visible

Not a docs table row. G1: floor binds on `~$0.0667 ≤ charge < $0.10`.

| Component | USD | Notes |
| --------- | ---: | ----- |
| Buyer pays | 0.08 | |
| 20% nominal | 0.016 | |
| Floor | **0.02** | **binds** (`0.016 < 0.02 ≤ 0.024`) |
| 30% cap | 0.024 | does not bind |
| **Platform fee** | **0.02** | 25% effective |
| **Seller earnings** | **0.06** | binding: `floor-0.02` |

## 5. This packager (unpublished; zero LLM)

Do **not** copy the `$0.18` row as the list price.

```
buyer_charge = (target_net + upstream_cost) / 0.80
             = ($0.08 + $0.00) / 0.80
             = $0.10
```

| Buyer pays | 20% | Floor | Cap | Fee | Seller | Effective | Binding |
| ---------: | --: | ----: | --: | --: | -----: | --------: | ------- |
| 0.10 | 0.02 | 0.02 | 0.03 | 0.02 | 0.08 | 20% | nominal-20pct |

Suggested (Root only, **not run**): `npx grexal agent price add run_completed 0.10`. Pricing is **not** in `grexal.json`. Buyer reserve at `$0.10` would be `$0.125`.

## 6. Buyer replay without paying

**Definition:** a buyer validates the agent’s declared I/O from `grexal.json` and exercises the local entrypoint. No Grexal account, credits, or `runs invoke`.

`grexal.json` is the runtime contract (`entrypoint`, `runtime`, typed `input_schema` / `output_schema`). Marketplace name, description, category, tags, **pricing**, and visibility are **not** in the file — a buyer cannot read the billed amount from the schema.

Executed this cell (`paid=false`, `grexalAuth=false`, `~/.grexal` absent):

```bash
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/validate-manifest.mjs
node experiments/s109-marketplace-entry-trials/surfaces/grexal/buyer-replay/replay.mjs
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/agent/pack_evidence.js \
  --unifiedDiffFile <diff> --stdout-only
```

| Schema | Fields | Types |
| ------ | ------ | ----- |
| input | `repoPath`, `unifiedDiff`, `baseRef`, `headRef`, `acceptanceNotes` | all `text`, all optional |
| output | `summary`, `commitRange` | `text` |
| output | `diffBytes`, `paidModelCalls` | `number` |
| output | `acceptanceReport`, `evidencePack` | `json` |

Replay receipt: `surfaces/grexal/buyer-replay/receipt.json`. Sample: 93-byte unified diff → `commitRange=replay-base...replay-head`, every output key type-matched, **`paidModelCalls=0`**. Manifest sha256 unchanged from G2: `7440dfacada0bd06ef16e27d51a943c0be4117ec170a16b31c11027a480b637c`.

**Proves:** declared I/O names/types; local entrypoint emits that shape; no paid model calls on the unpaid path.

**Does not prove:** hosted sandbox identity, listed price, marketplace “Typical: $X.XX” baseline (docs: 10+ organic completed runs), settlement.

## 7. Attribution — SameDayDesk evidence tools (upstream) vs Grexal runtime fee

These are **independent ledgers**. Grexal’s 20% does not license SameDayDesk tools. SameDayDesk x402 prices do not settle a Grexal run.

| Layer | Who | What the buyer is looking at | Money |
| ----- | --- | ---------------------------- | ----- |
| SameDayDesk evidence tools | this repo | `tools/recurring-job-recipes` (`source-change-alert`, `issue-evidence`, `issue-to-work-brief`, `comparable-record-extraction`, `verification-reconcile`, `buyer-setup-trace`); `tools/evidence-records`; `tools/evidence/reconcile.mjs`; `tools/result-reuse` | Operator compute `costs_unknown`. Recipes do **not** purchase `POST /extract/batch` (listed **0.01 USDC** on `/for-agents`). |
| Public recipes | epistemedeus | `x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666` (no LICENSE file at pin) | Free. Do not resell as proprietary. |
| Merchant evidence pin | epistemedeus | `x402-url-extractor@3516cd40ba275c9f228443158097137cac44d003` | Tooling pin, not a Grexal SKU. |
| SameDayDesk machine gateway | `agents.samedaydesk.com` | x402 / MPP catalog (example: `/work/opportunity-preflight` **0.05 USD**) | **Independent** of Grexal. This packager does **not** call it. |
| Grexal runtime | Grexal | sandbox + listing + orchestration of a published agent run | `clamp(buyer_charge × 0.20, $0.02, 30%)` |
| Seller packaging | SameDayDesk, if Root publishes | git range → unified diff + acceptance JSON | keeps `buyer_charge − platform_fee` |

**Rule:** sell packaging / acceptance / delivery support only. Do not claim proprietary ownership of free recipes. If a future Grexal agent *did* call SameDayDesk paid routes or an LLM, that spend is **seller upstream cost** (not covered by Grexal’s marketplace fee) and must be recovered as its own line item — the same pattern the payments docs use for Claude tokens.

This G2/G3 packager hard-codes `paidModelCalls=0` and makes no gateway calls, so Grexal fee is the only platform take on a future listed run.

## 8. Free alternative vs paid delta

- **Free:** `git diff` + notes; local SameDayDesk recipes; public skill pin above.
- **Paid delta (if Root publishes):** hosted per-run packaging on Grexal at the listed line item. Buyer pays list; Grexal takes the clamp; seller keeps the rest. That is packaging labor on Grexal compute, not recipe relicensing and not a SameDayDesk x402 purchase.

Unknown buyer demand is an experiment, not a Stage-1 blocker.

## Authenticated step needed (Root, not this worker)

`grexal login` → first `push` (mints `agentId`) → `agent set-description/set-category/set-tags` → `agent price add run_completed 0.10` → `set-visibility` → `publish`.

## Next

Root creates Grexal agent identity and sets pricing/visibility **without this worker spending**. Still no login from this overlay.

## Sources

- https://docs.grexal.ai/docs/payments
- https://docs.grexal.ai/docs/agent-manifest
- https://docs.grexal.ai/llms.txt
- `experiments/s109-marketplace-entry-trials/fixtures/grexal-payments.txt`
- `native-cells/out/G1-grexal-contract.json`, `G2-grexal-package.json`
- `surfaces/grexal/package/grexal.json`
- `surfaces/grexal/buyer-replay/receipt.json`
- `tools/recurring-job-recipes/README.md`, `tools/evidence-records/README.md`
- `PINS.md`

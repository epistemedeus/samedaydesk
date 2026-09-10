# S75 RESULT — issue-evidence release acquisition

## Pins

| Item | Value |
| --- | --- |
| Branch | `codex/s75-issue-job-release-20260910` |
| Compose HEAD (pre-RESULT commit) | `7ceba6d915bb226e19134e474f1c7c45d8af178c` |
| Owning main base | `c295af075c86ab28fea075633e95934a776d006c` (`origin/main` at compose) |
| Reviewed S71 tip | `063d04c3828e197bff32f3aa69a54170982a39a5` |
| S69 acquisition surface | `overlays/s69-issue-job-acquisition/` |
| Lean archive | `overlays/s69-issue-job-acquisition/dist/issue-evidence-job-063d04c3828e.tar.gz` |
| Archive sha256 | `cd596a85cea655d00438fad4b5ac871b9051f4985c9b8ea668d6cd41ef7426b9` |
| Node | v22.14.0 |

## What composed

- Merged reviewed S71 issue-evidence (pagination/partial honesty/prior identity/acceptance retention) onto current main.
- Kept S69 SKILL/CLI/site archive overlay; **rebuilt** lean archive from composed tip (not a re-pin of the S62 zip).
- Lean CLI prior digest now hashes the **full payload** so S71 `loadOptionalPrior` accepts sequenced artifacts.
- Paid-operator note `docs/HTML-VS-COMMENTS.md`: why generic HTML misses comments — no paid-HTML failure claim, no full-history completeness claim, no pricing/hosted route/sales/external post.

## Real commands / tests

- `node --test tools/recurring-job-recipes/test/*.test.mjs` → **96/96 pass** (includes S62+S71).
- Customer/merchant library gates with `MERCHANT_INPUT_ROOT=/home/ubuntu/work/s56/x402-compose` → **23/23 pass** (prerequisite supplied; not reported as full suite when missing).
- Browser smoke → **4/4 pass**.
- Acquisition overlay → **8/8 pass**.
- Pack/extract literal fixture refresh → `changed` then prior round-trip.
- Live public `NousResearch/hermes-agent#99533` (token-free, max 2 comment pages): **changed → unchanged**, completeness `complete`, state `open`, **2 comments**.
- Native recipient on published-candidate archive: literal CLI refresh + Grok 4.6 shell handoff wrote `native-agent-refresh/issue-evidence.seq-2.json` with outcome `unchanged`, completeness `complete`, 2 comments.

## Neomorphic (scoped)

- `origin/main` tip at test: `8b015afb46cca4e3b1050a267aa232e27bf86ed1`; SDK PR28 `c9a77998aa7a5c7424bec0871aa5cee079606636` is ancestor.
- `npm run build` 56 pages; unit **170/170**.
- Acquisition browser 1280/390 homepage + task-square: **4/4** after small guilloche overflow fix in `styles/main.css`.
- Stock task-square browser review: **5/5**.
- No S73 observatory/first-job/shared-host edits; no S70 continuation-pack overlap.

## Out of scope honored

No main merge, deploy, payment, public message, bid, or service activation. No new pricing/hosted route/sales claim/external post.

## Export note

If `epistemedeus/samedaydesk` push returns 403, exact BASE/TIP git bundle ships under EIN `handoff/s75/` with prerequisites listed.

## Export (403 path taken)

- SDS push to epistemedeus/samedaydesk: HTTP 403
- EIN handoff branch: `codex/s75-issue-job-release-handoff-20260910`
- See `handoff/s75/` on epistemedeus/ein-llc-lean for bundle + archive digest

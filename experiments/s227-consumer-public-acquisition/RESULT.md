# S227 RESULT — public consumer evidence acquisition

Native parent session: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`  
Model: `grok-4.6` · effort `xhigh`  
Node: `v22.22.2` (`/home/ubuntu/.nvm/versions/node/v22.22.2/bin`)  
Branch: `codex/s227-consumer-public-acquisition-20260910`  
Base / S221 tip preserved: `f357508d25d30c5e9a3af9b44644c8e4d97bcd10`  
Merchant source: `epistemedeus/x402-url-extractor` @ `e7a53c48a2db5393e1e340e5d43143547f79dbd7`

Cash $0. No merge/deploy. Production acquisition: false. Archive not rebuilt.

## Product
One public inner page `/for-agents/consumer-repeat` plus machine discovery for the committed consumer evidence/repeat archive. An agent can read the job, obtain exact bytes (URL + size + sha256), run labeled samples or caller files, keep partial/refuse outcomes with provenance, and repeat on a changed input without overwriting caller files.

Pins aligned across page, `machineEntry`, `/discovery/consumer-repeat.json`, and `/kit/s178-consumer-repeat-archive.sha256.json`.

| Field | Value |
| --- | --- |
| Archive | `/kit/s178-consumer-repeat-kit.tgz` |
| Bytes | 718948 |
| SHA-256 | `04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d` |
| Reviewed package source | `361460288e96d43da2f215e158fad96745507fde` |
| Vendor reference only | `vendor/s137-consumer-evidence-kit.tgz` (214024 / `9ad8fd3a8a9d9794b939d93af594c86e420fae33726e177257ff7251b2fa1e58`) |

Material limit (buyer copy): operator `--clock` is required. Local provenance files are integrity metadata, not an independent attestation, and `ok:true` is honest completion rather than a pass. A local completion is not an actual customer delivery.

## Obtain flow
Documented curl + size/sha256 check + tar, no repository dependencies. Helper `bin/obtain-kit.mjs` (tests): wrong digest, wrong size, or non-200 status refuse with `extracted:false` `executed:false` and do not write dest. Fresh extract outside checkout: two caller files (procurement pass, release-brief conflict), changed-input repeat (partial then reconciled pass, `repeatInput` written to a new file), malformed JSON `invalid_json` and negative procurement `fail`, caller hashes unchanged.

## Gates (Node 22)
| Gate | Result |
| --- | --- |
| s227 public-discovery + obtain/acquire | 10/10 |
| client build | pass (shell `for-agents__consumer-repeat.html`) |
| spa-fallback | 2/2 |
| spa-route-shells | 9/9 |
| hosted-startup | 4/4 |
| for-agents overflow | pass |
| desktop 1440 | pass (includes consumer-repeat) |
| mobile 390 | pass |
| width 320 | pass, failures `[]` (`/tmp/tmp.Dryfn85dMe`) |

## S221 carry-forward vs re-executed
Carry forward (runtime unchanged; not re-run): Pulse vs `origin/main` empty, PG not re-run; homepage / prices / payment / checkout; record-repeat and distribution-repair pages, kits, discovery, and receipts; s134/s163/s176/s185 kit suites.

Re-executed because SPA/runtime lists gained a route: client build, spa-fallback, spa-route-shells, hosted-startup, overflow, browser 1440/390/320.

`git diff f357508` is empty for `RecordRepeat.tsx`, `DistributionRepair.tsx`, record/distribution kits and discovery, Pulse, Landing, Checkout.

## Capacity (existing meter, one observation)
- admit: `2026-09-10T16:29:14Z` (`native-cells/receipts/capacity-admit.json`)
- complete: `2026-09-10T16:45:52Z`
- elapsed from admit: 1012 s
- native active workers: **1** (pid 209732, RSS 156008 kB, `grok-4.6` / xhigh / session `01a08b8c…`). Not a 6/12/18/24 cohort.
- nproc 4; MemTotalKb 16398384; MemAvailableKb 10803780; MemFreeKb 5846100; loadavg 1.00 1.02 1.00
- Cursor collector is a separate OS process on the same VM.

## Remaining limits
No production acquisition claim. `gh pr create` may fail on GitHub App token (S214 GraphQL permission). Root owns merge/deploy.

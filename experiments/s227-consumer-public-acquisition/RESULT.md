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


## S239 — public cold-start repair (Cursor Auto after Heavy 402)

Native Heavy session `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5` hit Grok Build 402 (balance exhausted) at handoff. Checkpoint: `native-cells/receipts/s239-quota-checkpoint.json`. Cursor Auto completed this authorized small repair without reset/overage.

### Defects fixed
1. One authoritative `buildConsumerRepeatColdStart()` in `machineEntry.mjs` drives discovery JSON, page `<pre>`, and crawler HTML. Python verify uses argv (no JSON `\"` hazard). Decoded discovery text equals `CONSUMER_REPEAT_COLD_START`.
2. Cold start is one portable shell function: fresh `mktemp -d`, explicit `|| return 1` (not `set -e` alone), curl `--max-time 60`, verify before extract, cleanup workdir on failure, prints kit path; caller commands keep `$PWD/...` paths.
3. New `test/literal-cold-start.test.mjs` executes literal decoded commands from discovery JSON **and** crawler HTML: wrong status/size/digest, shell conditional refusal, positive path with two callers + changed-input repeat. Existing obtain-kit helper tests remain; they are not a substitute.

### Gates executed
| Gate | Result |
| --- | --- |
| experiment tests (literal + obtain + discovery) | 16/16 |
| `npm run build` (Node v22.22.2) | pass |
| spa-fallback | 2/2 |
| spa-route-shells | 9/9 |
| hosted-startup | 4/4 |
| browser desktop 1440 | pass |
| browser mobile 390 | pass |
| browser width 320 | pass (`mobile.mjs --viewport 320x568`) |

Archive unchanged: 718948 bytes / sha256 `04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d` (matches 718948 / `04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d`). Homepage/payment/Pulse/S221 record+distribution untouched. No merge/deploy.

## S246 — current-source composition (Cursor Auto; Heavy exhausted)

Source tip composed: S239 `a9e937473750dbbb7611e70b4e61554bf15b8681` on `codex/s227-consumer-public-acquisition-20260910`.  
Merged `origin/main` at PR #49 merge `596694df34bdbe604269d888547961bddc526163` **without force**. Merge was clean (no conflict markers). Native Heavy checkpoint preserved; no retry/reset/overage.

### Preserve check
| Asset | Status |
| --- | --- |
| Consumer archive | unchanged 718948 / `04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d` |
| Record-repeat kit/page/discovery | present (S221) |
| Distribution-repair kit/page/discovery | present (S221) |
| Homepage / payment / Pulse | untouched by merge |
| Merchant source pin | `e7a53c48a2db5393e1e340e5d43143547f79dbd7` |

### Extra composition gates (`test/s246-composition-gates.test.mjs`)
Literal discovery cold-start under `sh` and `bash`: function inside `if` and `&&` contexts; failure (status/size/digest) stops before fake-tar/kit; failed invocation does not remove/overwrite caller marker; two concurrent positive acquisitions with unique `mktemp` dirs + two caller inputs + changed-input repeat. Manifest cold-start string equals renderer/crawler and `CONSUMER_REPEAT_COLD_START`.

### Gates executed
| Gate | Result |
| --- | --- |
| experiment tests (all) | 22/22 |
| `npm run build` (Node v22.22.2) | pass |
| spa-fallback | 2/2 |
| spa-route-shells | 9/9 |
| hosted-startup | 4/4 |
| browser desktop 1440 | pass |
| browser mobile 390 | pass |
| browser width 320 | pass |

Cash $0. Root owns merge/Hostinger/readback.

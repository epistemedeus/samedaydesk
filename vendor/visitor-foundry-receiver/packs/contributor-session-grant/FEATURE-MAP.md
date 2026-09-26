# W5-E07 contributor-session-grant feature map

Wave5 **W5-E07** (Ex06 contributor session/grant consumer). Owned paths
`packs/contributor-session-grant/` and `experiments/wave5/e07/RECEIPT.md`.
I01 owns the kernel. This pack is a thin consumer.

| Row | Requirement | Surface | Notes |
|---|---|---|---|
| **W5-E07** | Empty 201 is unknown, not success. Non-idempotent grant reconciles without broad owner credentials. | `packs/contributor-session-grant/` | CLI `--role owner\|contributor`. Draft PR to `neomorphic-io` `main`. |

## Caller journey

1. Owner process `prepare-and-issue` against loopback I01: create fixture task, reserve funding, `POST /v1/contributor-tokens` (no Idempotency-Key), write `grant/contributor.token` (0600) and hash-only `owner-state.json`. Persist `grant-attempt.json` before the POST.
2. HTTP 201 with an empty or non-object body, or a 201 without token plaintext, is `unknown_outcome`. Do not write a token file. Do not POST again.
3. Owner `reconcile --out-dir` reads `contributor.token` if present. Success does not send owner credentials and does not POST. Missing token file remains unknown.
4. Contributor process `claim` with that file, no `EARNED_WORK_OWNER_TOKEN`. Persist `claimIdempotencyKey` before POST. Empty 201 is unknown and keeps the key.
5. Contributor `reconcile` replays the stored I01 claim Idempotency-Key. Public GET task is not used for reservation recovery.

## Seeded failures (rejected)

| Failure | Code |
|---|---|
| Contributor process started with `EARNED_WORK_OWNER_TOKEN` set | `owner_token_in_contributor_process` |
| Token plaintext in usability/state logs | `secret_leak` (write refused) |
| Contributor `issue`, `--auto-retry-unknown-grant`, or reusing a non-empty grant `--out-dir` | `owner_only_grant` / `unknown_grant_no_auto_retry` / `grant_out_dir_not_empty` |
| Owner grant `--idempotency-key` | `grant_idempotency_header_forbidden` |
| Empty or non-object HTTP 201 | `unknown_outcome` |
| Integer `termsVersion` (original F01 residual) | `integer_terms_version` |

## Reuse (not rewritten)

| Import / pin | From | Used for |
|---|---|---|
| I01 OpenAPI extract | Neo PR54 `346bbd3cbe6943a83b2077c455174d74b7a493ad` | Comparison pin for `POST /v1/contributor-tokens` (no Idempotency-Key) and hash `termsVersion` |
| In-tree compiled kernel | PR91 protocol `4542e80ca2ceb08d7da2cba1e482cae97bb57830` | Live `dist/index.js` HTTP+Postgres. Not tsx. |
| E02 method-map row | Wave4 Ex13 `50f605e6ef459a500bd3a643165f16b5fbb5d680` | `createContributorToken` `idempotency:false`. Not vendored. |
| E03 job-resume | Wave4 Ex08 `037fbd0138de3a237536b006d51de89b48e015ad` | Claim replay stays on I01 Idempotency-Key. Kernel not copied. |
| Original F01 OpenAPI | `51d149a923978dfb7827d1b96d0b042304edd150` | Comparison only; integer claim key is not sent |
| F04 OpenAPI | `280310d769de0ca4c4b21633a8da7ba6bbc943b0` | Injected ledger adapter; later binding |
| First-job grant rules | `packs/outside-operator-first-job/README.md` on main `45391e02` | Empty `--out-dir`; no auto-retry unknown grant |
| W2-12 secret-free logs | `packs/zero-account-usability/FEATURE-MAP.md` `c16de8fa` | Usability/state redaction honesty |
| CX contract | Pilot `54cbdf443db9251993a1b9089c653a1dabe2bed6` `earned-work-cx.v1.json` | Hash terms; nonpaying labels |

## Later integration bindings

| Binding | Owner | Status |
|---|---|---|
| In-tree compiled kernel | W5-E01 / PR91 | Live boot `4542e80` protocol via `dist/index.js`. Historical `346bbd3c` is comparison-only. |
| F04 `POST /v1/grants role=contributor` | F04 / W4-exchange-05 | Adapter ready. Not an earned-work claim token. |
| W4-exchange-04 walletless first job | sibling pack | Consume this CLI. Missing sibling did not block. |
| W5-E02 typed SDK | E02 / Wave4 Ex13 `50f605e6` | Method map consumed. Remaining: typed unknown-outcome envelopes from a later E02 export. |
| W5-E03 job-resume | W5-E03 / Wave4 Ex08 `037fbd01` | Claim key replay is local. Remaining: consume E03 export if it publishes a resume helper. |

## Do not touch

- `services/earned-work/` (I01 owns the kernel)
- Homepages and other product brands
- Sibling W5 ownedPaths

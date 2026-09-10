# S227 — Public consumer acquisition journey (same Heavy parent)

You are the **same** authenticated native Grok Heavy parent.
Session: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`
Model: `grok-4.6` · effort: `xhigh`
Cursor = transport/Git/collection. **You** own source, tests, push.

## Freezes

- Branch (checked out): `codex/s227-consumer-public-acquisition-20260910`
- Base / S221 tip preserved: `f357508d25d30c5e9a3af9b44644c8e4d97bcd10`
- Merchant source (verified exists): `epistemedeus/x402-url-extractor` @ `e7a53c48a2db5393e1e340e5d43143547f79dbd7`
- Cash $0. Ordinary feature push / draft PR OK. **No** default merge/deploy/payment/overage/reset.
- Do **not** change homepage, current offers, prices, payment, checkout, Pulse, or S221 record/distribution pages/kits/behavior.
- Do **not** invent customers, demand, hosted service, or a new paid tier.
- Do **not** call receipt integrity an independent attestation, or a local completion an actual customer delivery.
- Keep announced / shipped / tested and omitted / invalid distinctions as the packages define them. Do not reinterpret.

## Vendor inputs already on disk (Cursor placed; verify digests)

Public kit (single offer — S178 includes embedded S137/S153 evidence jobs):

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `client/public/kit/s178-consumer-repeat-kit.tgz` | 718948 | `04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d` |

Vendor reference only (not a second public offer):

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `experiments/s227-consumer-public-acquisition/vendor/s137-consumer-evidence-kit.tgz` | 214024 | `9ad8fd3a8a9d9794b939d93af594c86e420fae33726e177257ff7251b2fa1e58` |

Read:

- `experiments/s227-consumer-public-acquisition/vendor/S220-RESULT.md`
- `experiments/s227-consumer-public-acquisition/vendor/S178-FIRST-USE.md`
- Unpacked kit `FIRST-USE.md` / `bin/s178-cli.mjs` / examples

**Reuse exact public archive bytes unchanged** unless you reproduce a source defect that blocks acquisition. Never rebuild during acceptance.

## Product goal

One public inner page + machine-discoverable free acquisition for the consumer evidence/repeat jobs so an agent can:

1. Understand the concrete offline job
2. Obtain the exact package (URL + bytes + sha256)
3. Use its own supplied input
4. Get partial / refuse / useful result with provenance
5. Run a changed-input repeat without overwriting caller files

Fit existing SameDayDesk design + `machineEntry` / `llms.txt` / discovery conventions (mirror record-repeat / distribution-repair patterns).

Suggested route: `/for-agents/consumer-repeat` (or better fit if you find a clearer existing convention — one route only).

Plain useful copy. No internal task names (S153/S178/S220/S227 jargon in buyer prose). No prose em dashes. One concise material limitation.

Samples clearly labeled vs caller files. Source pins + package metadata aligned across page, discovery JSON, kit receipt, and machineEntry.

## Acquisition command requirements

Document and test a literal obtain flow that:

- Downloads the committed public archive
- Verifies size + sha256
- On wrong digest / wrong size / bad status: **no extraction and no execution**
- Fresh extract of the exact committed archive outside the checkout
- Two distinct caller inputs
- Changed-input repeat
- Malformed / partial refusal without overwriting caller files
- Documented clean first use with **no repository dependencies** and **no repack** during acceptance

## Gates (Node 22 from nvm on PATH)

1. `node -v` must be v22.x
2. Client/build **before** generated-site tests
3. Focused public discovery / route / link / download checks
4. Literal acquisition wrong-digest/size/status refusals
5. Fresh archive consumer cases above
6. Desktop / 390 / 320 browser for the new public inner page
7. Existing site/startup/SPA checks that are affected
8. `git diff origin/main` (or S221 tip) proves homepage / Pulse / checkout / S221 record+distribution surfaces unchanged where required

Record which S221 gates carry forward unchanged vs which you re-executed because runtime changed.

## Capacity

At meaningful phase admit/complete, record via existing meter (not a new watcher):

- actual native active-worker count
- effective memory/cgroup and available RAM/RSS
- workload
- elapsed time
- tested output summary

Do **not** call one worker a 6/12/18/24 cohort.

## Deliverable

1. Product source (page, route, machineEntry, discovery, llms, kit receipt alignment)
2. Compact `experiments/s227-consumer-public-acquisition/RESULT.md` + one receipts JSON
3. Commit product+receipt (no final-hash self-stamp inside RESULT)
4. Push branch
5. Open draft PR if `gh pr create` works (compare URL ≠ PR)

Terminal head after push is what Cursor collects.
Return native session/model/exit and final branch/archive/source/gate receipt.

# TERMINAL

Programme 1 journey seams are demonstrated on the prepared SDS source. This writer did not install c606, did not reopen PR377, c606, or H155100, and did not launch another Heavy parent.

## Tested source and PR

- Repository: `https://github.com/epistemedeus/samedaydesk.git`
- Branch: `codex/n7-task-repeat-use-20261106`
- Prepared parent: `c60641e8ff2b94dd704307e57f5b6fe789ba0df7`
- First journey commit: `f60a29bce5c3658db6d239590d4cb99a67040ccc`
- Receipt file commit: `8c7e9d910b99cef2b674e75709180088453fbf3a`
- Repaired tested source: `3640978865b8fe33d074cabd1995844d5f22726b`
- PR: https://github.com/epistemedeus/samedaydesk/pull/380 (open)
- PR base: `codex/h136010-machine-release-20261103` at `c60641e8ff2b94dd704307e57f5b6fe789ba0df7`
- Worktree: `/home/ubuntu/ae14-work/nov06-p1-agl-programme-1`
- Writer path: `tools/task-repeat-use`
- This update records the repair. It does not change the journey again.

## Installed versus prepared

- Prepared combined source is `c60641e8ff2b94dd704307e57f5b6fe789ba0df7`. AGL-ROOT15599 enrollment stays `received: false`, `installed: false`, `qualified: false`. It was not installed at the PR377 receiving (`f168ee158428d7e5bcc086f011ec3bca05e550db`, merge `ba18ed20e139d950bdd470a5d4bad6b2541c3a31`). This writer did not install it and did not restamp enrollment.
- Installed predecessor source remains `9f6c0c4e396dd7677f334400eed93e3445fad600`. Root's final c606 provider/consumer receiving, publication, money, and live-account authority stay with Root. Reported Hostinger `01a1af3b-60e0-71c6-b248-8e92244ec0ae` was not called.
- Installed merchant coverage is `9fba328c`, Railway `9a8c2f97`, runtime `1.23.55`, paid MPP off, rail x402, from pilot `overview/STATE.md` at `9a85c34af020feebaac5e653987f190ab0ab0d5c`. This path sets `called: false`.
- Older in-tree pins stay distinct: machine entry `ef46e2b5213b9436e5cc4339a159c8ae837db880`, recipe input `f9dd59aeeb200881bc1313ed846ba002e7081258`. H133 accepted-work `9bb30906` stays a public GET.

## Outside use and payment

- Outside use: none.
- Payment evidence: none.
- A fitting later distinct reuse may show the existing x402 choice (`eligible: true`, `taken: false`, `charged: false`, `newPrice: false`, authority `existing_x402_on_installed_merchant`). No quote, capture, settlement, or ledger write.
- A caller-supplied new price is refused and not echoed. Original terms digest and earned debt `21` are echoed unchanged.

## Commands and exits

Working directory `/home/ubuntu/ae14-work/nov06-p1-agl-programme-1`. Test executable `/exec-daemon/node` `v22.23.4`.

The first suite run on `f60a29bce5c3658db6d239590d4cb99a67040ccc` exited 0 (12 pass). A later run exited 1. `JSON.stringify(result).includes("50000")` matched digits inside a wall-clock sample (`0.6410750000000007`). `paidChoice.refused` stayed `new_price_refused` and the price field was absent. Repair `3640978865b8fe33d074cabd1995844d5f22726b` rounds samples to three decimal places and checks for an exact price value. Ten runs on that working tree exited 0, and one run on the committed repair exited 0 (12 pass, 0 fail, `duration_ms` 97.309415).

CLI commands below exited 0 on `f60a29bce5c3658db6d239590d4cb99a67040ccc`. The repair does not change those seam results.

| Command | Exit |
| --- | ---: |
| `node --test --test-concurrency=1 tools/task-repeat-use/test/*.test.mjs` | 0 (12 pass, 0 fail) |
| `node tools/task-repeat-use/cli.mjs coverage` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case fitting` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case identity` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case signup` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case first-party` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case withdrawn` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case nonfitting-capture` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case private` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case unsupported` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case new-price` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case terms-rewrite` | 0 |
| `node tools/task-repeat-use/cli.mjs walk --case debt-rewrite` | 0 |
| `git push -u origin HEAD` (`c60641e8..f60a29bc`) | 0 |
| `gh pr create` base `codex/h136010-machine-release-20261103` | 0 |

Signup, terms rewrite, and debt rewrite exit 0 because the seam is `demonstrated`. Their journey `ok` is false: signup code `signup_refused_already_public`, terms code `terms_unchanged_required`, debt code `earned_debt_unchanged_required`.

Fitting reuse: `independentReuse: true`, producer calls 0 versus direct 1, quality `same_approved_body`, money `costs_unknown`, wall-clock claim `single_sample_not_an_economic_advantage`. Changed capture: `capture_digest_mismatch`, direct outcome `changed`. Private field: direct `available: false`, producer calls 0. Unsupported recipe: direct `aglSupported: false`, `directCompleted: false`. First-party owner: `first_party_owner_control`, not independent reuse.

`git push -u origin HEAD` for `c60641e8..f60a29bc` exited 0. `gh pr create` exited 0. `git ls-remote` then matched `f60a29bce5c3658db6d239590d4cb99a67040ccc`. The receipt commit push `f60a29bc..8c7e9d91` exited 0, and `gh pr view 380` then reported `headRefOid` `8c7e9d910b99cef2b674e75709180088453fbf3a`. The repair `3640978865b8fe33d074cabd1995844d5f22726b` and this receipt update are pushed together after this file is committed. The session receipt records that `git ls-remote` and the final `git rev-parse HEAD`.

## Native receipt

- Native executable: `/home/ubuntu/.grok/downloads/grok-linux-x86_64`
- Grok version: `grok 1.0.77 (50ca579fa996)`
- Catalog model / effort: `grok-4.7` / `xhigh`
- Account: `epistemedeus` (`gh api user`)
- Wrapper PID / native PID / launcher child PID: `58263` / `58265` / `58255`
- Session: `c275610e-d7b6-41f7-8765-3fbb81c54642`
- VM / boot: host `e337`, hostname `cursor`, boot `63a647f1-25f8-4fec-8675-b29b3445dc3b` (re-read from `/proc/sys/kernel/random/boot_id`)
- Writer: `tools/task-repeat-use` on `/home/ubuntu/ae14-work/nov06-p1-agl-programme-1`
- Receipt root: `/home/ubuntu/root-sol-window100337/ae14-nov06-p1-agl-programme-1`
- Input receipt: `/home/ubuntu/root-sol-window100337/ae14-nov06-p1-agl-programme-1/inputs/RECEIPT.json` sha256 `b2ac239cb075f670784362a1f23077e5af2872ff80e1cee063e6898682fa10bb`
- Operating context: pilot `9a85c34af020feebaac5e653987f190ab0ab0d5c`
- Assignment blob: `47c7183bda70bc8413d42636dc58519e2d3ddd18`

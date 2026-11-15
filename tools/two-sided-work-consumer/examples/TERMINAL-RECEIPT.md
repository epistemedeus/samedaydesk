# Terminal receipt

Programme 4 two-sided work consumer. Prepared source. No claim, spawn, payment, or public reward disclosure.

- Writer branch: `codex/n7-te-two-sided-20261106`
- Package commit: `79c9cd1702552919bfc737f2f08ee5fc17455de7`
- Writer tip: head of `codex/n7-te-two-sided-20261106` after this receipt commit. Confirm with `git rev-parse HEAD` and `git ls-remote origin refs/heads/codex/n7-te-two-sided-20261106`.
- Draft PR: https://github.com/epistemedeus/samedaydesk/pull/382
- Base: `codex/h136010-machine-release-20261103` at `c60641e8ff2b94dd704307e57f5b6fe789ba0df7` (current machine-source)
- Worktree: `/home/ubuntu/ae14-work/nov06-p4-te-programme-4`

## Native run

- Executable: `/home/ubuntu/.grok/downloads/grok-linux-x86_64`
- Version: grok 1.0.77 (50ca579fa996)
- Route: `native-grok-subscription`
- Subscription account: `epistemedeus`
- Catalog model: `grok-4.7`
- Effort: `xhigh`
- Session: `b72ddb59-2979-4d87-90de-20c31e9ab0f4`
- Native PID: 5807
- Wrapper PID: 5805
- Host: `h4` (hostname `cursor`)
- Boot id: `8902040d-1167-48bb-8336-486bbb7d4f6b`

## Tests

`node --test tools/two-sided-work-consumer/test/*.test.mjs`

16 passed, 0 failed, exit 0.

## Consumer receipts

- Public proof: `tools/two-sided-work-consumer/examples/public-proof.json`
- Whole-effort comparison: `tools/two-sided-work-consumer/examples/whole-effort-receipt.json`

The public proof is consented synthetic work (`heading-extract`). `rewardDisclosed` is false. It does not contain the gross, platform fee, or contributor net. `marketLiquidity` is false. `outsideUse` is `not_observed`.

## Whole-effort disclosure

Clock `2026-11-06T12:00:00.000Z`, scenario `authorized`. No price was invented.

- Composed path: 6 steps (post, claim, deliver, accept, proof, project-fee). Evidence `meets_criteria`. Effort `measured_effort_equal`. Fee readout `authorized_existing_terms`, `feeBps` 500, `feeBasis` `new_job_gross`, gross `2000000`, platform fee `100000`, contributor net `1900000`, `cumulativeFloorDelta` `0`, equal-net true.
- Direct path: 4 steps, all exit 0. `tools/task-bundle-economics/cli.mjs diagnose`, `compare`, `tools/result-reuse/cli.mjs export`, and `quoteEconomics` from `vendor/hosted-wallet-market/src/fee.mjs`.
- Outcomes match on evidence, effort comparison, fee atoms, and public reward omission.
- Unknown review, support, and contributor lines stay `unknown`.
- `operatorCompute`, `monetaryCost`, and `recomputeCostAvoidedNetOfUpkeep` are `costs_unknown`.
- Hosted-wallet-market server was not called. Its claim path writes the hosted ledger and requires funding.

Separate scenarios in the same test file: missing gross stays `gross_unknown` with the quote not called; `feeBps` 100 is `terms_fee_bps_not_authorized` with no computed fee.

## Installed versus prepared

- Prepared: yes, on this writer branch.
- Installed: no. This host does not seal a formal admit archive, and the guarded client is not installed here.
- Payment evidence: none.
- Outside use: not observed.
- PR 374 was not reopened. `tools/task-bundle-economics`, `vendor/hosted-wallet-market`, and `tools/result-reuse` were not rewritten.

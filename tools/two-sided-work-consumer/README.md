# Two-sided work consumer

Caller-owned journey for one requester and one selected agent. It posts useful work, claims or selects a single occupant, records a delivery, and takes substantive acceptance from the existing task-bundle-economics diagnose outcomes (`meets_criteria`, `refused`, `needs_review`). It can then write a reward-free reusable proof and project the existing 5 percent gross / equal-net fee.

The journey file is a receipt. It is not a ledger, a balance, or an obligation store. This package does not pay, sign, quote a new take rate, or call the hosted-wallet-market server.

## Consume, do not rewrite

See [IMPORT_MAP.md](./IMPORT_MAP.md).

- Acceptance and fee readout: `tools/task-bundle-economics` (`diagnoseFor`, `compareFor`).
- Fee arithmetic: `vendor/hosted-wallet-market/src/fee.mjs` through that package. `FEE_BPS` is 500 and `feeBasis` is `new_job_gross` only when the posted terms already say so.
- Reusable proof: `tools/result-reuse` `exportReuse`, after the public record has been stripped of reward amounts.
- Retained locks follow the H128 rule: a held lock is kept. Dead pids, retries, and `--automatic` do not unlock it. Explicit release needs the holder id and fencing token.

Source-only runs, owner QA, and these synthetic fixtures are not market liquidity. No outside use or payment is claimed.

## Commands

```bash
node tools/two-sided-work-consumer/cli.mjs post --journey /tmp/journey.json --input post.json --clock 2026-11-06T12:00:00.000Z
node tools/two-sided-work-consumer/cli.mjs claim --journey /tmp/journey.json --input claim.json --clock 2026-11-06T12:00:00.000Z
node tools/two-sided-work-consumer/cli.mjs select --journey /tmp/journey.json --input selection.json --clock 2026-11-06T12:00:00.000Z
node tools/two-sided-work-consumer/cli.mjs deliver --journey /tmp/journey.json --input delivery.json --clock 2026-11-06T12:00:00.000Z
node tools/two-sided-work-consumer/cli.mjs accept --journey /tmp/journey.json --input acceptance.json --clock 2026-11-06T12:00:00.000Z
node tools/two-sided-work-consumer/cli.mjs proof --journey /tmp/journey.json --input proof.json --clock 2026-11-06T12:00:00.000Z --opt-in --out /tmp/public-proof.json
node tools/two-sided-work-consumer/cli.mjs project-fee --journey /tmp/journey.json --input fee.json --clock 2026-11-06T12:00:00.000Z
node tools/two-sided-work-consumer/cli.mjs recover --journey /tmp/journey.json --clock 2026-11-06T12:00:00.000Z
node tools/two-sided-work-consumer/cli.mjs api --request /tmp/request.json
node tools/two-sided-work-consumer/cli.mjs whole-effort --clock 2026-11-06T12:00:00.000Z --scenario authorized --out /tmp/whole-effort.json
node --test tools/two-sided-work-consumer/test/*.test.mjs
```

`api` is the normal HTTP-free adapter: one JSON request in, one JSON result out. Mount `handleApi` from `src/http.mjs` if a caller already has an HTTP server. This package does not listen on a port.

`show --public` and `proof --out` are the showcase surfaces. They omit gross, platform fee, contributor net, and other reward amounts. The private journey file keeps those amounts for the requester who posted them.

Unknown review, support, contributor, and unmeasured effort costs stay `costs_unknown`. A missing gross stays `gross_unknown`. Terms that are not 500 bps on `new_job_gross` do not receive an invented fee.

## Occupancy

Claim and selection are one occupant. A second claim is `double_claim`. A different selection, or a claim by someone other than the selected agent, is `selection_conflict`. The requester cannot claim or select themselves.

The process lock file `<journey>.retained-lock` is exclusive. A concurrent writer receives `retained_lock_refused` and does not delete the lock. `recover` reports `retained_lock_kept`. `recover --automatic` returns `automatic_unlock_refused` even when the recorded pid is dead. `recover --explicit-release` removes only that process lock when the holder id and fencing match, and it does not clear occupancy. Occupancy release before delivery is `release` with the occupancy fencing token. Delivery keeps the occupant.

## Whole-effort comparison

`whole-effort` runs this consumer, then the existing compare CLI, diagnose CLI, result-reuse export CLI, and, only when terms authorize a known gross, `quoteEconomics` from `fee.mjs`. It records step counts and whether the evidence outcome, effort comparison, and fee atoms match. Operator compute and any avoided recompute cost stay `costs_unknown`. The hosted market server is not called, because its claim path writes the hosted ledger and requires funding.

Sample receipts from the synthetic heading extract, clock `2026-11-06T12:00:00.000Z`:

- [examples/public-proof.json](./examples/public-proof.json)
- [examples/whole-effort-receipt.json](./examples/whole-effort-receipt.json)

The public proof is consented synthetic work with no reward. The whole-effort file is a private comparison, `publicShowcase: false`, and it repeats the existing rail amounts rather than a new price.

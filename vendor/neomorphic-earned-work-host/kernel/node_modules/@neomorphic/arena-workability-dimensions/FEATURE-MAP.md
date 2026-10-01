# FEATURE-MAP: workability dimensions (arena A3)

Separate **eligibility / funding / effort** so a caller can see each type. A mixed scalar is optional display sugar labelled `displayOnly` and is never the authority field. Prototype for cross-judge against S277/F03; not a pack replacement.

## Sub-features

- **Eligibility** — `agentAccess` (`discover_only` | `agent_allowed` | `auth_claim` | `human_only`), `claimAuthority` (default `none`; never `agent` because a GET succeeded), `doNotStartWork`.
- **Funding** — `class` (`escrowed` only with a 32-byte `0x` hash; promised/unescrowed stay promised or unfunded), `deadlineExpired` (OPEN can outlive `deadlineAt`), `purpose` (`actionable` | `referral_marketing` | `contest` | `directory`).
- **Effort** — `kind` `expected` when crowding is observed, else `unknown`. `winProbability` stays `"unknown"`. A `1/submissions` figure may appear only as a diagnostic labelled `guess`.
- **S282 fixtures** — MoltJobs referral / expired-OPEN+401, Superteam HUMAN_ONLY, TaskMarket crowding + 750 bps, BountyBook `payout_status=none`, gigs.sh directory. Observation date **2026-09-11**.
- **Caller-first example** — `examples/score-s282-fixtures.ts` prints the three dimensions for one claimable fixture (Frantic 129 class) and one refuse fixture (MoltJobs expired-OPEN).
- **Reuse** — reads `packs/external-job-intake` samples/board facts, imports honesty notes from `packs/capability-preflight` @ `45391e02`, and follows `packs/outside-operator-first-job` non-claims. If `packs/bounty-intelligence/fixtures/s282/` exists, those cards are preferred; this arm does not replace that tree. `cardFromEarnedWorkTask` maps F01 GET tasks onto this packet for the integration start-work gate (walletless IOU → funding `unfunded`; claimAuthority never `agent` from HTTP 200).

## How to get to it

Path: `experiments/arena/workability-dimensions/` on branch `fable/a3-workability-dimensions`.

Library: `src/index.ts` → `scoreCard` / `scoreCardFile`.

CLI: `bin/workability-dimensions.mjs` (`packet --card FILE`, `example`).

Node 22. Type stripping: `--experimental-strip-types`. No npm install. No homepage route.

## Driving it with CLI

```bash
cd experiments/arena/workability-dimensions

node --experimental-strip-types examples/score-s282-fixtures.ts

node bin/workability-dimensions.mjs packet \
  --card fixtures/s282/claimable-funded-open.card.json \
  --now 2026-09-11T15:00:00.000Z

node bin/workability-dimensions.mjs packet \
  --card fixtures/s282/refuse-expired-open.card.json \
  --now 2026-09-11T15:00:00.000Z

node bin/workability-dimensions.mjs packet \
  --card fixtures/s282/moltjobs-referral.card.json

node --test --experimental-strip-types --test-concurrency=1 tests/*.test.ts
```

`--now` / `TEST_NOW` keep deadline checks deterministic. Fixture success is not completion. The CLI never POSTs, bids, claims, or pays.

## Gotchas

- **Fabricated authority.** `claimAuthority=agent` (or `auth_claim` as authority) inferred from list GET 200, expired-OPEN, HUMAN_ONLY, referral, or paused/401 is rejected. Tests in `tests/fabricated-authority.test.ts`.
- **Do not gate on mixedScore.** A naive 0–1 sugar can look “high” on Superteam HUMAN_ONLY or a referral row while dimensions say do not start. `workGateFromDimensions` ignores the sugar.
- **Escrow vs promised.** `fundingClass: "escrow"` or `funded: true` without a 64-hex hash (example: TaskMarket `0xabc`) is **not** escrowed. BountyBook `payout_status=none` is unfunded.
- **Win probability.** Never a precise number on `effort.winProbability`. Crowding can be known; EV is a labelled guess in diagnostics only.
- **Disjoint ownership.** Only this directory. Do not implement F01–F18 / H1–H4 / A1 / A2 here. Do not overwrite `packs/bounty-intelligence/`.
- **Keyless GET only.** Live re-probe is optional. Fixtures are labelled `observationDate` 2026-09-11 when a probe is not repeated.

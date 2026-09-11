# W5-D15 RECEIPT — input/execute race harness

**Date:** 11 September 2026
**Assignment:** W5-D15
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d15-deterministic-input-execute-race-harness-4fc6`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/75
**Owned path:** `experiments/wave5/d15/`

## Tested implementation

SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` (`server/paid-useful-jobs/`).
Execute goes through `node server/paid-useful-jobs/bin/cli.mjs`. This harness
does not claim a later D01 freeze.

pstack: marketplace plugin `9717366` v0.15.1 pin `68d834d9`. Skills were
read from cache (`feature`, `prove-it-works`, `test-behavior`, `tdd`,
`opening-a-pr`, `no-comments`). Literal slash did not run. Model for this
run is Cursor Grok 4.6 xhigh (`cursor-grok-4.6-xhigh`). No extra Cloud agents.

## Current-source finding

`materializeInputs` stores the caller file path. `runEngineJob` reads that
path later. `inspectSample` reads the same path first. Mutating the live file
after inspect, then calling the wrapper, executes the new bytes. Receipt
`sha256` follows the live file. Directory `--input-root` is the same alias.

That is `race-consumed-mutated` under `--bind live-observe`. It is not an
engine crash.

## What this package does

1. Preflight: `inspectSample` plus copy/hash into an isolated freeze dir.
2. Mutate only the live path.
3. `--bind frozen`: paid CLI receives freeze copies. Domain status/summary
   match the unmutated control. Receipt hash matches freeze, not live.
4. `--bind verify-live`: refuse `input-changed-after-preflight` and do not
   spawn the engine.
5. `--bind live-observe`: pass live paths and classify SDS52 behavior.

Valid no-change (`informational`, `fieldChanges=0`) stays `frozen-consumed`.
Unknown job is `wrapper-refuse`, not transport or engine failure. Engine
`digest` includes `generatedAt`, so two runs of the same bytes are not forced
equal.

## Tests

```bash
node --test experiments/wave5/d15/test/*.test.mjs
```

**PASS** — 10 tests, 0 fail, 0 skipped. Node v22. Postgres was not required
and was not skipped as a green gate.

Literal CLI:

```bash
node experiments/wave5/d15/bin/d15-race.mjs run vendor-budget-impact \
  --before /tmp/before.json --after /tmp/after.json \
  --bind frozen --mutate-after after --mutate-mode identical-before
```

## Remaining integration bind (D01)

Copy inspected file bytes into the wrapper work directory at materialize
time, or refuse when live digest drifts before `runEngineJob`. Until that
lands, consumers that need freeze-or-refuse should call this harness or copy
before `runPaidOffer`. D14/D02 are not claimed here.

No homepage, root manifest, wrapper, spend, or production deploy in this PR.

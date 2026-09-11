# W5-M07 receipt

Independent package-manager lock fixtures on SameDayDesk. Owned path `experiments/wave5/m07/` only.

## Source

- Repo: `epistemedeus/samedaydesk`
- Starting ref: `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)
- Feature branch: `cursor/w5-m07-independent-package-manager-lock-fixtures-across-supported-formats-a386`
- Engine replayed: W4-commerce-11 `e81efc8ab71b1bde88eca743d297149e61bbb6f2` at `tools/lockfile-pin-delta/` (W5-M03 owner). Read-only worktree. Kernel not copied.
- Wrapper SDS52 was not invoked. Catalog wiring stays with W5-M01 / D01.

## Commands

Node v22.14.0. No extra npm packages. Postgres unused. Not a skipped store claim.

```bash
cd experiments/wave5/m07
node --test --test-concurrency=1 test/*.test.mjs
node bin/replay.mjs
```

`node --test`: **9 pass, 0 fail, 0 skip**. `node bin/replay.mjs`: **20 pass, 0 fail** (7 match, 2 named gap, 11 valid refusal, 0 engine failure).

## Proof

Version and integrity changes on independent npm v2 and v3 fixtures have explained `pin-delta.json` rows. Unchanged pins are omitted. Noise-only root metadata and a stale v2 `dependencies` map with an identical `packages` map are valid no-change. HTML, package.json, lockfileVersion 1/4, yarn, pnpm YAML, pnpm JSON v9, bun, composer, and Cargo refuse with explained codes and exit 2, not crashes.

Git identity stored only in `resolved` (same version and integrity) is omitted by the current engine. Domain still wants that explained. Git identity stored in the `version` string is explained as a version change.

## Reproduced current-source findings

These are live CLI or process results against `e81efc8a`, not claims that W5-M03 already changed.

1. `resolved-source-omitted`. npm v3 git commit and registry URL swaps with identical name, version, and integrity yield status `informational` and zero pin deltas.
2. `constant-hasher-redefines-byte-equality`. Default hasher lists the integrity-only pin. `createHashTermsAdapter(() => "constant-injected-hash")` reports `changed=0`.
3. stdout `digest` is the first changed pin `termsHash`, not SHA-256 of `pin-delta.json`. Unlike yarn refusal hashes are not forced equal to npm pin hashes.

## Remaining integration binding

W5-M03: add resolved source (and git identity that is not already in `version`) to pin identity, and stop treating a constant injected hasher as byte equality. Do not claim that later M03 behavior. W5-M01: catalog / paid-wrapper listing. This consumer tested Co11 `e81efc8a` only.

No deploy, spend, payout, or customer messages.

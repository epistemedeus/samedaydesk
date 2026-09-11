# W5-M03 receipt

Co11 lockfile pin and Git resolution comparison on SameDayDesk.

## Source

- Repo: `epistemedeus/samedaydesk`
- Starting ref: `e81efc8ab71b1bde88eca743d297149e61bbb6f2` (`codex/w4-commerce-11-20260911`)
- Feature branch: `cursor/w5-m03-co11-lockfile-pin-resolution-comparison-712b`
- Implementation commit: `a410d49e` (field equality). Receipt commit follows.
- Owned paths: `tools/lockfile-pin-delta/`, `experiments/wave5/m03/RECEIPT.md`
- Secondary ref (read-only worktree `/tmp/sds-pr52-aeef964-ro`): PR52 `aeef964fa188443078958d9d6d393afae1d542ee`. Wrapper and catalog do not list this job. No wrapper source was copied.
- Exact GitHub `compare.mjs` / `hash-terms.mjs` at `e81efc8` matched the checkout.

## Current-source findings at `e81efc8`

Reproduced, not inferred:

1. `comparePinMaps` treated `termsHash` as equality. `compareLockfileTexts` with `hashPinTerms: () => "injected-terms"` on `fixtures/integrity-only` reported `changed: 0`.
2. Parser ignored `resolved`. A git `#commit` change with the same name, version, and integrity was `unchanged`.
3. Same miss on this repo `package-lock.json` when only `node_modules/zod.resolved` changed.

Valid analysis stayed distinct from transport failure. HTML still refuses with exit 2 `html-input`. SAMPLE-as-customer still refuses. Missing integrity stays `partial` and still lists the git resolved delta on the v2 dependencies fixture.

I01 `hashRequest` was not bound and was not forced equal to pin-triple hashes.

## Fix

Pin identity is `name`, `version`, `integrity`, and `resolved`. `pinFieldsEqual` / `pinChangeKinds` own that. `termsHash` is an annotation from the pin-triple hasher. An injected constant or unstable hasher cannot hide or invent a field difference. CLI `digest` is SHA-256 of the written `pin-delta.json` bytes, not the first changed pin's hash.

Public contract: `bin/lockfile-delta.mjs` and `lib/index.mjs` (`compareLockfileTexts`, `runLockfileDelta`, `createHashTermsAdapter`). Schema remains `samedaydesk.lockfile-pin-delta.v1` with additive `resolved`, `gitCommit`, and `equality: "pin-fields"`.

## Tests

Node v22.14.0. From `tools/lockfile-pin-delta/`:

```
node --test --test-concurrency=1 test/*.test.mjs
```

**29 pass, 0 fail, 0 skip.** No skipped gate.

Public CLI also run:

- `--before fixtures/journey/before.json --after fixtures/journey/after.json` → `ok`, `actionable`, `changed: 1`
- `--before fixtures/git-resolved/before.json --after fixtures/git-resolved/after.json` → `ok`, `actionable`, `changeKinds: ["resolved"]`
- HTML before file → exit 2, `html-input`
- SAMPLE fixtures → exit 2, `sample-as-customer-delta`

Loopback HTTP served git-resolved after-lock bytes into `compareLockfileTexts`. SDS `package-lock.json` resolved-only CLI path listed only `zod`.

Postgres is not part of this job. No Postgres server was used or skipped-as-pass.

## Integration binding

Integration owner: W5-M01. Tested implementation is this branch after the W5-M03 commits, built on `e81efc8`. Remaining bind: paid-useful-jobs wrapper at PR52 `aeef964` still has no lockfile-delta job. Do not claim that wrapper runs this CLI. Consumers can call `node tools/lockfile-pin-delta/bin/lockfile-delta.mjs` against this head.

## Limits

- yarn.lock and pnpm-lock.yaml
- lockfileVersion 4+
- I01 hasher not on this SDS checkout
- No catalog or homepage edit
- No deploy, purchase, or live payment

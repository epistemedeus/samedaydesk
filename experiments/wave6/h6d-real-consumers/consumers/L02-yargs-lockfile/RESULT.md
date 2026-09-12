# L02-yargs-lockfile result

Status: **complete**. Tests: **6 pass / 0 fail**.

## Source pins

- Repo: `yargs/yargs` (MIT)
- Path: `package-lock.json`
- before: `4153e0f097aeaf43a71a2530db6dda51dff2c544` (2026-07-11, chore: improve build robustness #2554)
- after: `8878a894111e3fe7c98d84af546c0f34fa017492` (2026-07-26, chore(main): release 18.1.0 #2475)
- Stored sha256: `fbab2725…177130` (before, 281077 bytes) / `06b3c838…edac40` (after, 281077 bytes)

## Engine vs witness

Independent witness and useful-jobs 1.4.0 `lockfile-pin-delta` **agree**.

| | added | removed | changed | unchanged | status |
| --- | ---: | ---: | ---: | ---: | --- |
| witness | 0 | 0 | 0 | 562 | informational |
| engine | 0 | 0 | 0 | 562 | informational |

Proven fact: every `packages` registry pin (name, version, integrity, resolved) is identical. The only lockfile bytes that change are the local project version `18.0.0` → `18.1.0`. Root `packages[""]` is not a registry pin. No `regression-artifact.json`.

## Tests

`NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs`

1. Positive — official pair, informational, 562 unchanged pins
2. Identical-control — after = before, zero delta
3. Negative — `yarn.lock` refuses
4. Negative — `package.json`-only refuses (`package-json-only`)
5. Negative — HTML refuses (`html-input`)
6. Witness does not import kit engines

yarn.lock: witness code `yarn-lockfile`; engine code `parse-error` (not JSON). Both exit closed. That is a refuse-code naming difference, not a pin misclassification.

## Honesty

Not mocha/axios/webpack-cli/npm-cli lockfiles. Not a conversion of yarn/pnpm/bun. Not a purchase. Engines unmodified. SAMPLE fixtures were not used as customer work.

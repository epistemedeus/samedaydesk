# L04-winston-lockfile result

Status: **pass**. Tests: **6 pass / 0 fail**.

```bash
NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs
```

## Source pins

Official pair is `winstonjs/winston` `package-lock.json` (MIT). Fallback `koajs/koa` was not used.

| | SHA |
|---|---|
| before | `4b963a9f5b1ef24efb6250354a108b80c0c6e7d9` |
| after | `96dccd6e32174c658149189abb6edb13572281b4` |

After commit is PR #2621 “Bump async from 3.2.5 to 3.2.6”. Its parent is the before SHA. Retrieval: GitHub REST + raw on 2026-09-12T06:50:11Z. Full lockfiles stored under `fixtures/official/` with sha256 in `acquisition.json` / `SOURCE.md`.

## Proven fact

`node_modules/async` changed all three mutable pin-identity fields (name inferred from the packages key):

- version `3.2.5` → `3.2.6`
- integrity `sha512-baNZyqaa…ErLsg==` → `sha512-htCUD…C2AA==`
- resolved `…/async-3.2.5.tgz` → `…/async-3.2.6.tgz`

Zero added pins, zero removed pins. After also adds `"license": "MIT"`, which is not a pin-identity field.

## Engine vs independent witness

| Case | Witness | Engine 1.4.0 |
|------|---------|----------------|
| Positive official pair | actionable; 1 changed (async version+integrity+resolved); 612 unchanged | same counts, same fields, `purchaseAuthority: false` |
| Control after=after | informational; 0 changed/added/removed; 613 unchanged | same |
| Negative `yarn.lock` | refuse `yarn-lockfile` | refuse `parse-error` (yarn v1 is not JSON), exit 2 |
| HTML / package.json-only / missing `--after` | refuse | refuse `html-input` / `package-json-only` / `missing-required-inputs` |

Agree on the pin fact. Yarn refuse codes differ by classifier; both refuse. No `regression-artifact.json` (the engine did not misclassify the async pin). Witness does not import kit compare/oracle.

## Honesty

- Not a customer, paid call, token-arbitrage, or live-fetch job.
- yarn.lock is not npm `lockfileVersion` 2/3.
- Kit engines unmodified. Cold extract: `vendor/useful-jobs-1.4.0/` from published archive sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`.
- Receiving owner: H6D parent catalog + `bin/select-job.mjs`.

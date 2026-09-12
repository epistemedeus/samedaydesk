# L01 commander.js lockfile — result

Status: **pass** (`6` tests, `0` failed).

Job: useful-jobs **1.4.0** `lockfile-pin-delta`  
Source: `tj/commander.js` `package-lock.json` (MIT)

## Source pins

| | SHA | Commit |
| --- | --- | --- |
| before | `9098b4863ef7678b9d138ae0f04afd949287510c` | Update dependencies (#2506) 2026-04-13 |
| after | `d785d8b3b9448952ef023a8cd26a0a3923a90458` | Update dependencies (#2518) 2026-05-22 |

Both files are npm `lockfileVersion` 3.

Full-blob sha256:

- before (94671 B): `58f7587d6e2aaa12b3f82914c38af3774dabd1c6de2a5ca26741d4f2c3bbf528`
- after (95153 B): `1ad36cdbfbbac6513de58c34772e4769670e6c484a7a2927b5e13a3ade0941d5`
- LICENSE (1098 B): `04512a63dce4d2d506ad612dc0bd7681ccf6e3655f7b6eaef7dfac8323d1ec0b`

## Pin delta (name+version+integrity+resolved)

Independent witness and cold engine agree:

- 203 → 204 pins
- **added 1**: `@humanfs/types@0.15.0`
- **removed 0**
- **changed 25** (version + integrity + resolved)
- **unchanged 178**
- missing integrity: 0
- engine status: `actionable`

Spotlight: `typescript` 6.0.2→6.0.3, `eslint` 10.2.0→10.4.0, `prettier` 3.8.2→3.8.3, `@eslint/config-helpers` 0.5.5→0.6.0.

## Tests

`NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs`

1. Witness does not import kit engines
2. Positive official pair (witness + cold adapter)
3. Identical-control (`after=before`) → empty delta; engine `informational`
4. Negative yarn.lock refuse
5. Negative package.json-only refuse (`package-json-only`)
6. Adapter `purchaseAuthority` is not true

## Engine vs witness

Official pair: **agree** on added/removed/changed ids and versions.

Identical control: **agree** on empty delta (engine label `informational`, witness fact `identical`).

package.json-only: **agree** (`package-json-only`, exit 2).

yarn.lock: both **refuse** (exit 2). Witness code `yarn-lock`; engine code `parse-error` (non-JSON). Recorded in `regression-artifact.json`. Engine was not edited. Yarn is not treated as an npm pin map.

## Honesty

- No purchase, settlement, customer, or paid-call claims
- No live fetch on the job path
- yarn.lock is not converted to package-lock
- SAMPLE / `--example` / H04 mocha-axios excerpts were not this pair
- Receiving owner: H6D parent catalog + `bin/select-job.mjs`

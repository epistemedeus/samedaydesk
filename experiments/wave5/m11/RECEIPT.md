# W5-M11 RECEIPT

**Task:** W5-M11
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-m11-caller-supplied-example-corpus-replacing-fixture-only-demonstrations-660b`
**Owned path:** `experiments/wave5/m11/`
**Starting pin:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52 `fable/f08-paid-wrappers`)
**Tested implementation:** PR52 `server/paid-useful-jobs/bin/cli.mjs`
**Archive:** sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 bytes

## Current-source finding

Kit `samples/pricing/caller-alpha` (and public CALLER_USE paths) still carry
`label: "SAMPLE"` plus `SAMPLE.txt`. `--example` loads `samples/pricing/a/`.
Those are labeled demonstrations, not independently valid caller input.
PR52 already runs unlabeled caller files through the existing engines. This
package does not add a second kernel.

## What landed

Caller corpus contract and CLI. SAMPLE/--example members are refused as caller
corpus (`sample-not-caller-corpus`). Independently valid files spawn the PR52
wrapper. Domain comparison uses status/actions/keys, not forced digest
equality. Valid no-change (`ops-stable-rates`, informational / `no-budget-delta`)
is analysis, not a crash. Wrapper `--example` is classified `sample`.

## Tests

```bash
node --test experiments/wave5/m11/test/*.test.mjs
node experiments/wave5/m11/bin/corpus.mjs run --corpus experiments/wave5/m11/caller-corpora
```

**13/13 pass, 0 skip** (3 suites: journey, independence, seeded-failures).
Postgres is not required for this claim.

Meaningful diffs on the shipped corpus: `ops-desk-rate-raise` (actionable
price fields) vs `vision-unit-shift` (partial unit-normalize + price fields).
Runtime-generated caller files also differ. Note-only edits keep the same
domain. Unlike jobs are not hash-equalized.

## Integration limits

W5-M01 catalog/engine contract is not bound yet. Consumers should keep using
this PR52 pin until M01 publishes. No homepage or root manifest edits. No live
sale, payout, or production deploy.

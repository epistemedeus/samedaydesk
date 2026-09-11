# W5-M11 — caller-supplied example corpus

Thin consumer of the SameDayDesk PR52 paid wrapper. It does not reimplement
useful-jobs. Kit `--example` and `samples/` SAMPLE pairs remain labeled
demonstrations. This package accepts a caller corpus and runs the wrapper CLI.

Tested implementation: SDS `aeef964fa188443078958d9d6d393afae1d542ee`.
Remaining binding: W5-M01 catalog/engine contract when it lands.

## Literal journey

From the repository root, Node >= 22:

```bash
node experiments/wave5/m11/bin/corpus.mjs validate \
  --corpus experiments/wave5/m11/caller-corpora

node experiments/wave5/m11/bin/corpus.mjs run \
  --corpus experiments/wave5/m11/caller-corpora \
  --out-dir /tmp/w5-m11-caller

node experiments/wave5/m11/bin/corpus.mjs compare \
  --corpus experiments/wave5/m11/caller-corpora \
  --a ops-desk-rate-raise --b vision-unit-shift
```

`ops-desk-rate-raise` and `vision-unit-shift` are independently valid
vendor-budget inputs. They produce different action kinds / field keys.
`ops-stable-rates` is a valid no-change report, not a crash.

Kit SAMPLE paths (including `samples/pricing/caller-alpha`, which still carries
`label: "SAMPLE"`) are refused as caller corpus members.

## Tests

```bash
node --test experiments/wave5/m11/test/*.test.mjs
```

Missing wrapper/archive is incomplete coverage, not a skipped pass.

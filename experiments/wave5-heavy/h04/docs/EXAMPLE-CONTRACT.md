# H04 example contract

Each useful-job example lives under `examples/<family>/<id>/` and is loaded by `src/catalog.mjs`.

This is a **useful-job** benchmark, not W5-M06–M09 unit corpora. An example is a paying-caller job: before/after inputs, a proven changed (or unchanged) fact, and an expected useful report. Do not copy W4 engine SAMPLE fixtures as the corpus.

## `example.json`

```json
{
  "id": "h04-<family>-NN",
  "family": "schema-webhook | lockfile | api-routes | page-facts",
  "title": "short title",
  "kind": "change | no-change-control | reorder-control",
  "engines": ["w4-json-schema-webhook-drift"],
  "inputs": { "before": "./before.json", "after": "./after.json" },
  "changedFact": "one sentence a buyer would pay to know",
  "expectedStatus": "engine-family status/verdict string",
  "expectedHighlights": ["strings that must appear in a useful report"],
  "source": {
    "repo": "epistemedeus/samedaydesk",
    "beforeSha": "40-hex",
    "afterSha": "40-hex",
    "path": "repo-relative path"
  }
}
```

`kind` `no-change-control` is required in each family. Noise, title-only, unused-field, or identical pins must not be reported as a breaking consumer fact.

## Required sibling files

| File | Role |
| --- | --- |
| `SOURCE.md` | Primary source: full SHAs, path, quoted excerpt from `git show` |
| `fact.md` | One paragraph: the actual fact |
| `expected-report.json` | Oracle for a useful report (status, highlights, consumer action). Not a copy of engine stdout |
| Inputs named by `example.json` | Bounded legal-to-store fixtures |

## Engine families (pins)

| Engine id | SHA | CLI |
| --- | --- | --- |
| `sds52-paid-useful-jobs` | `aeef964fa188443078958d9d6d393afae1d542ee` | `node server/paid-useful-jobs/bin/cli.mjs` |
| `w4-json-schema-webhook-drift` | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` | `node tools/json-schema-webhook-drift/bin/webhook-drift.mjs` |
| `w4-lockfile-pin-delta` | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` | `node tools/lockfile-pin-delta/bin/lockfile-delta.mjs` |
| `w4-route-table-diff` | `7387eb677abd442dfab9081cb0ad95451fd2a762` | `node tools/route-table-diff/bin/route-diff.mjs` |
| `w4-page-change-offline-job` | `91b57334818ecd7940cb854e9864f3b1749d1d1d` | `node tools/page-change-offline-job/bin/page-change.mjs` |

Worktrees: `/tmp/w5-h04/ro-sds52`, `ro-w4-schema`, `ro-w4-lockfile`, `ro-w4-routes`, `ro-w4-pages`. Write `--out-dir` outside those trees.

## Expected-report oracle (fact-level)

`expected-report.json` is compared by `src/compare.mjs` at fact level, not byte-identical engine output:

- `status` / `verdict` must match when the engine succeeds
- each `expectedHighlights[]` must appear in JSON or Markdown artifacts
- `unknown` if the engine refused, crashed, or the artifact is missing — never invent a pass

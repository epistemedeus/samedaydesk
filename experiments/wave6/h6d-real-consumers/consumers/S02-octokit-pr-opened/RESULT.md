# S02-octokit-pr-opened result

Status: **pass** (`10` pass / `0` fail).

Command: `NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs`

## Source pins

- Repo: `octokit/webhooks` (MIT)
- Path: `payload-examples/api.github.com/pull_request/opened.payload.json`
- Before: `e3e60cb5336a261199d30f33f080017160df5d4d` (candidate confirmed: used pointer absent)
- After: `0f5bd1859ef98b4b7513f415d3ec739f0819850c` (`auto_merge` added, value `null`)
- Path-walk parent: `c7f0d67c07feac24862b294ac219afee5fe62b1b` also lacks the pointer

Used pointers: `/pull_request/auto_merge` (added) and `/action` (unchanged control `"opened"`).

## Engine vs witness

Independent witness and cold useful-jobs 1.4.0 `json-schema-webhook-drift` **agree**:

- Positive official pair → engine `kind=webhook-example`, `status=actionable`, added `/pull_request/auto_merge` (`present-after-only`); unchangedCount 1 for `/action`.
- Identical after/after control → `informational`, unchangedCount 2.
- Control used-pointer `/action` only across the official pair → `informational`, unchangedCount 1.
- OpenAPI JSON negative → refuse `not-this-job-openapi` (nonzero exit).

The public brief lists added pointer rows but only `unchangedCount` for unchanged used paths. Witness lists both pointer arrays. Engine unmodified; no `regression-artifact.json`.

## Honesty

Webhook example JSON, not OpenAPI, not schema-org `exclusiveMinimum`. Forbidden `organization.renamed` and H04 `create/payload.json` were not used. Kit `--example` was not treated as customer work. `purchaseAuthority=false`, `sold=false`, no live fetch or payment. Unused payload fields may differ across intervening prettier/label commits between the assigned SHAs; the job ignores unused paths.

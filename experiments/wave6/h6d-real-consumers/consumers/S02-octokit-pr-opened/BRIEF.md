# S02-octokit-pr-opened

Family: `schemaWebhook`
useful-jobs 1.4.0 job: `json-schema-webhook-drift`
Exclusive path: `experiments/wave6/h6d-real-consumers/consumers/S02-octokit-pr-opened/`
Official source: `octokit/webhooks` path `payload-examples/api.github.com/pull_request/opened.payload.json`
Candidate SHAs: `e3e60cb5336a` → `0f5bd1859ef9`
License hint: MIT

Webhook EXAMPLE json (not OpenAPI). Candidate fact: pull_request.auto_merge added in 0f5bd1859ef9. Confirm before SHA actually lacks the used pointer; if e3e60cb5336a is wrong, walk commits on that path. Used pointers: /pull_request/auto_merge (and a stable unchanged pointer as control). FORBIDDEN: organization.renamed; create/payload.json (H04). Control: used pointer that did not change. Negative: OpenAPI document → not-this-job-openapi.

Read `experiments/wave6/h6d-real-consumers/docs/CHILD-CONTRACT.md` and follow it exactly.
Resolve full 40-char SHAs via GitHub API or git. Store provenance. Independent witness. Positive/control/negative tests.
Receiving integration owner: H6D parent catalog + `bin/select-job.mjs`.
Write RESULT.json when done.

# H6D child contract

Parent owns `experiments/wave6/h6d-real-consumers/` except each child's exclusive subpath.
You own ONLY your exclusive directory. Do not edit engines, useful-jobs published bytes, or sibling consumers.

## Kit (read-only published bytes)
- Archive: `/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz`
- Mirror: `/tmp/h6d/wt/client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz`
- SHA256: `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` (2575215 bytes)
- Cold CLI: extract to a temp dir you own under your subpath `vendor/useful-jobs-1.4.0/` (or `$TMPDIR`) then:
  `NODE_OPTIONS=--max-old-space-size=768 node bin/useful-jobs.mjs run <job> ...`
- Do not treat `--example` / `samples/` as customer work. Do not claim SAMPLE as the official pair.
- Do not edit kit engines. If an engine misclassifies a proven fact, write `regression-artifact.json` with exact inputs, stdout, exit, and the independent witness. Unknown ≠ failure ≠ retry permission.

## Required deliverables in your exclusive dir
1. `SOURCE.md` — official repo, two SHAs, path, license, retrieval method, byte/sha256 of stored fixtures
2. `acquisition.json` — machine manifest (repo, beforeSha, afterSha, path, license, bytes, sha256, retrievedAt, method)
3. `witness.mjs` — **independent** semantic witness (do not import kit engine compare/oracle). Must implement `witness(before, after, used?)` returning `{fact, changed, unchanged, added, removed, unknown}`
4. `adapter.mjs` — cold CLI/CI adapter: spawn useful-jobs 1.4.0 with exact flags; capture stdout JSON + output files; never network on the job path
5. `owned-paths.json` — concrete outcome, exact inputs, owned paths, receiving integration owner (`H6D-parent`)
6. `test/consumer.test.mjs` — `node:test` with **positive**, **control** (identical before/after or unused-pointer), **negative** (wrong format / missing input / yarn.lock / OpenAPI-as-schema / live URL as appropriate)
7. `fixtures/` — bounded stored artifacts (excerpts OK if provenance of full blob sha256 is recorded). No mass scraping.
8. `RESULT.json` + `RESULT.md` — status, tests, source pins, engine vs witness, honesty notes

## Honesty
- No token arbitrage / profit / customer / paid-call claims
- No live fetch, payment, or scheduler
- Non-equivalent migrations must be labeled (OpenAPI path+method is not SDS `{path,canonical,title}`; HTML is not extract-batch)
- page-change `--example` is refused; supply a held job document with clock
- lockfile: npm lockfileVersion 2 or 3 only
- schema job: not OpenAPI; remote `$ref` refused
- route-table-diff: OpenAPI path maps refused; homepage `/` rewrite refused

## Tests
Run: `NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs`
Exit 0. Record pass/fail counts in RESULT.json.

## Exclusions (do not use)
OpenAI routes; Octokit `organization.renamed`; mocha/axios H04 lock excerpts; webpack-cli/npm-cli/yarn.lock H04 set-b; SDS schema-validator.html / resources.html / `/x402/verified` page facts; W5-M06..M09 corpora; HG04 CI wrapper; E01 / CW18–42 / HG01–04 owned paths as write targets.

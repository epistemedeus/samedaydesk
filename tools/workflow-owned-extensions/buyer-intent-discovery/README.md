# E07: read-only buyer-intent discovery

## Actual service and acceptance boundary

SameDayDesk provides free discovery and local processing of already-held evidence, not a general implementation, browser automation, or lead-contact service (`README.md`, `tools/offer-routing/capability-limits-matrix.json`). Its offline page-change capability compares two already-delivered extract-batch JSON snapshots, without fetching, scheduling, payment, or treating absent fields as deletion. Its result-reuse SDK previews or explicitly opts in to export already-produced extract-batch, page-change, and record results as bounded `neomorphic.task-memory.observation.v1` references, and can bind/reuse a source-change-alert decision only against matching manifests, identity, revision, clock and horizon (`tools/result-reuse/README.md`, `tools/result-reuse/src/export.mjs`). Export requires caller task identity, subject, sequence, clock and opt-in; schema validity is not acceptance or public-safety certification. Dify and Ghost are source-only adapters, not installed runtimes (`tools/workflow-owned-extensions/README.md`, `src/adapter.mjs` and `schema/tool-invocation.v1.json` within that package). Paid bounded static HTML extraction is separately described but paused at this base; it is not a callable fit here. Complete issue discussions, arbitrary JSON diff tools, screenshot comparison, JavaScript rendering, hosted job execution, implementing somebody else's requested feature, and another catalog's capabilities are not substituted for these boundaries.

## Supported acquisition

Only GitHub REST `GET https://api.github.com/search/issues` is used. Results are actual public issue title/body records, not a catalog of offers. `queries.json` keeps the existing vocabulary query (`extract-batch` plus `compare`) so the normal command stays usable. `--problem-first` selects the smaller public problem query (`page`, `snapshot`, `json`, `changed`) and does not require those product words. GitHub can tokenize hyphens or match broadly; search matches alone never establish fit. Closed issues can appear in acquisition but cannot qualify as current requests. No comments, linked pages, HTML, private feeds, posts, contacts, replies, purchases or merchant calls are fetched or executed.

- [Search API documentation](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests)
- [Rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [API terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms)
- Version header: `2022-11-28`, explicitly supported and used in the captures.
- Search limits: 10 requests/minute unauthenticated, 30/minute authenticated for ordinary issue search. General REST limits are 60/hour unauthenticated and typically 5,000/hour authenticated; GitHub headers and secondary limits are authoritative. One page, at most 100 items, no pagination/retry loop. No semantic search.
- Public search works without secrets. Optional `GH_TOKEN` is used only as an authorization header; it is never retained. The CLI does not read credential files or extract the enrolled gh token. The author captured fixtures with already-enrolled `gh api`.
- API terms prohibit spam and selling personal information. This package keeps task text and source URLs, not contact profiles, and supplies no outreach mechanism. Manual reuse must respect source rights and terms. Nothing here authorizes unsolicited contact.

## Commands and retained output

Node 22, ESM and builtins only. From repository root, no install:

```sh
P=tools/workflow-owned-extensions/buyer-intent-discovery
node "$P/cli.mjs" --query-file "$P/queries.json" --out /tmp/e07-vocabulary
node "$P/cli.mjs" --problem-first --query-file "$P/queries.json" --out /tmp/e07-problem
node "$P/cli.mjs" --input "$P/fixtures/recorded-search.json" \
  --query 'is:issue is:public "compare" "snapshots" "json"' --out /tmp/e07-recorded
node --test "$P/test/discovery.test.mjs"
```

`--out` is an artifact directory. It receives `query.json`, `discovery.json` and `digest.md`. The artifact includes task descriptions, fit/no-fit reasons, URLs, query, timestamp, explicit API version, partial-page coverage, acquisition mode and counts. A completed zero-fit acquisition exits 0 with `outcome: no_fit`, including empty results. Transport/API failures exit 1, retain the query, and never masquerade as empty search success. Use a fresh OUT to avoid confusing older artifacts after a failed acquisition.

Direct fallback, independent of this CLI and any workflow runtime:

```sh
# Read queries.json and run its saved query through the documented API.
gh api -X GET search/issues -H 'X-GitHub-Api-Version: 2022-11-28' \
  -f q='is:issue is:public "extract-batch" "compare" in:title,body' \
  -f per_page=20 > /tmp/e07-manual-response.json
```

The artifact also retains an equivalent unauthenticated GET URL. No shell command is constructed from issue text. The library exports `acquire`, `normalizeCandidate`, `classify`, `buildReport`, `digest` and `searchUrl` from `src/index.mjs`. `acquire` is one GET to a fixed host with a timeout, redirects refused and a 2 MiB parsed-response guard; that guard runs after transport buffering and is not a streaming memory limit.

## Classification and SDK handoff

Classification is deterministic textual screening, not an LLM claim of purchase intent. Four decisions stay separate:

- Problem fit: the source describes offline page-change comparison or opt-in reuse of an already-produced supported result. Natural language can fit without the words extract-batch, task-memory, page-change, or SameDayDesk. Saved page JSON still needs an explicit transformation into two extract-batch snapshots. That cost is `not_estimated`; this package does not quote it or perform the transformation.
- Contact readiness: an explicit open paid request plus the issue's declared GitHub owner route can justify one scope inquiry when the problem fits or is `needs_scope`, even if inputs, current scope, or final budget are unknown. That is not a commission, a buying event, or permission to execute.
- Execution readiness: issue prose is never the artifact. `executionReady` stays false and `inputsSupplied` stays false. Missing inputs are listed. Nothing in this package calls the result-reuse SDK.
- Paid intent: source-stated payment language is separate from observed payment. This consumer does not observe a payment. Mention of another project's payment is not intent for this request. Ambiguity is `unknown` or `needs_scope`, not a fabricated fit.

Visual diff, screenshots, arbitrary JSON or inventory diff, UI implementation, and browser rendering stay outside the service. The words build, fix, and bug do not by themselves veto a request that also states a supported problem. Closed, withdrawn, and pull-request records are not current requests. A missing owner is not invented. Instruction text in an issue is data: it cannot grant fit, contact, execution, or an email route. Fixture-only URLs stay labeled. No budget, customer, acceptance, or purchased demand is inferred.

The normalized task description preserves bounded issue prose instead of inventing a task from another catalog. A fitting handoff names the existing service route, invocation schema and missing inputs. It sets `executionReady: false`. Discovery text is not a result-reuse SDK input. It does not invoke the SDK on issue prose, fabricate JSON evidence, choose identity/clock/opt-in, modify merchant cores, or change the runtime installer. The new discovery report uses its own schema label because it is not a task-memory observation or completed extension invocation.

## Fixtures, evidence and verification

`fixtures/recorded-search.json` retains two real records from a 20-item public API response, with capture metadata in `fixtures/capture.json`. Both remain no-fits: visual before/after UI and Kubernetes inventory diff are not page-change comparison. The recorded subset is explicitly marked. `fixtures/fitting-shaped-search.json` is a constructed positive control with a fixture-only URL, not observed demand. `fixtures/empty-search.json` is the empty-result control. Tests also cover a natural-language problem fit, a scope inquiry without supplied inputs, explicit pay versus another project's payment, implementation-only work, closed and withdrawn requests, a missing owner, ambiguous comparison, malicious task text, result-reuse handoff, invalid responses, read-only request shape, query scope, failures, rate limits, bounds and hostile markup.

The vocabulary page in `examples/normal-acquisition.json` is the already captured 20-item default query, reclassified offline. It was not searched again. Its reported total of 913 is not a count of buyers. `examples/recorded-no-fit.json` and `.md` are the offline replay of the retained two-record fixture. Report schema is `samedaydesk.buyer-intent-discovery.v2`.

## Cursor VM runner

`run-e07.sh` requires fresh absolute ROOT and OUT paths, a full 40-character TIP, and the exact E07 branch. It initializes a fresh checkout, fetches that branch, refuses if fetched head differs from TIP, checks Node 22, runs only this package's pure test file, and, only when those tests exit 0, runs one problem-first live acquisition. It retains source SHA, logs, per-step `EXITS` and artifact `SHA256SUMS`. A completed zero-fit acquisition exits 0. Transport and HTTP failures exit 1 and are not recorded as an empty success. A skipped live step uses exit 97 when tests already failed. No token is required for a public checkout/search; private repository access requires an already-enrolled Git transport. If GH_TOKEN is already present, acquisition uses it without printing it. No install, installer, posting or PR creation occurs. Network failures remain nonzero, including rate limits. The runner does not repeat the vocabulary query.

```sh
ROOT=/tmp/e07-fresh OUT=/tmp/e07-evidence TIP=<full-head-sha> BRANCH=codex/n7-e07-buyer-intent-20261105 bash tools/workflow-owned-extensions/buyer-intent-discovery/run-e07.sh
```

A passing local test is not the runner receipt. `MACHINE-HANDOFF.md` records the fetched commit, per-step exits, and the one problem-first page actually returned. The classifier count on that committed copy is separate from the manual adjudication in the handoff.

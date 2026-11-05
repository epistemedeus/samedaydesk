# E07: read-only buyer-intent discovery

## Actual service and acceptance boundary

SameDayDesk provides free discovery and local processing of already-held evidence, not a general implementation, browser automation, or lead-contact service (`README.md`, `tools/offer-routing/capability-limits-matrix.json`). Its offline page-change capability compares two already-delivered extract-batch JSON snapshots, without fetching, scheduling, payment, or treating absent fields as deletion. Its result-reuse SDK previews or explicitly opts in to export already-produced extract-batch, page-change, and record results as bounded `neomorphic.task-memory.observation.v1` references, and can bind/reuse a source-change-alert decision only against matching manifests, identity, revision, clock and horizon (`tools/result-reuse/README.md`, `tools/result-reuse/src/export.mjs`). Export requires caller task identity, subject, sequence, clock and opt-in; schema validity is not acceptance or public-safety certification. Dify and Ghost are source-only adapters, not installed runtimes (`tools/workflow-owned-extensions/README.md`, `src/adapter.mjs` and `schema/tool-invocation.v1.json` within that package). Paid bounded static HTML extraction is separately described but paused at this base; it is not a callable fit here. Complete issue discussions, arbitrary JSON diff tools, screenshot comparison, JavaScript rendering, hosted job execution, implementing somebody else's requested feature, and another catalog's capabilities are not substituted for these boundaries.

## Supported acquisition

Only GitHub REST `GET https://api.github.com/search/issues` is used. Results are actual public issue title/body records, not a catalog of offers. The default query in `queries.json` requires public issues and searches for extract-batch comparison requests. GitHub can tokenize hyphens or match broadly; search matches alone never establish fit. Closed issues can appear in acquisition but cannot qualify as current requests. No comments, linked pages, HTML, private feeds, posts, contacts, replies, purchases or merchant calls are fetched or executed.

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
node "$P/cli.mjs" --query-file "$P/queries.json" --out /tmp/e07-live
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

Classification is deliberately narrow, deterministic textual screening, not an LLM claim of purchase intent. A fit requires an explicit already-held extract-batch pair for page-change comparison, or an already-produced supported result requested for task-memory export/reuse. Known implementation/acquisition requirements, closed issues and pull requests veto fit. This will miss paraphrases and may misread ambiguous text; every candidate needs human review, and no budget, willingness to pay, authorization or acceptance is inferred.

The normalized task description preserves bounded issue prose instead of inventing a task from another catalog. A fitting handoff names the existing service route, invocation schema and missing inputs. It sets `executionReady: false`. Discovery text is not a result-reuse SDK input. It does not invoke the SDK on issue prose, fabricate JSON evidence, choose identity/clock/opt-in, modify merchant cores, or change the runtime installer. The new discovery report uses its own schema label because it is not a task-memory observation or completed extension invocation.

## Fixtures, evidence and verification

`fixtures/recorded-search.json` retains two real records from a 20-item public API response, with capture metadata in `fixtures/capture.json`. Both are clear no-fits: visual before/after UI and Kubernetes inventory diff are not this service's page-change comparison. The recorded subset is explicitly marked. `fixtures/fitting-shaped-search.json` is a constructed positive control with a conspicuous fixture-only URL, not observed demand. `fixtures/empty-search.json` is the empty-result control. Tests also cover result-reuse handoff, invalid responses, closed/implementation vetoes, read-only request shape, query scope, failures, rate limits, bounds and hostile markup.

Three small live gh searches were captured on the box: snapshot comparison, URL/Markdown extraction, and the exact default query. No fitting buyer demand was verified. The normal query returned 20 candidates out of 913 reported matches, all classified no-fit; that count is not a count of buyers. The retained two-record example is checked byte-for-byte against the library by the pure test. `examples/recorded-no-fit.json` and `.md` are output from a local offline CLI replay, not a live CLI execution claim. `examples/normal-acquisition.json` and `.md` retain the full default-query page normalized by a second offline CLI replay, with its original capture time and `recorded` acquisition mode. No dependency installation, broad suite, installer or runtime was run on the shared box.

## Cursor VM runner

`run-e07.sh` requires fresh absolute ROOT and OUT paths, a full 40-character TIP, and the exact E07 branch. It initializes a fresh checkout, fetches that branch, refuses if fetched head differs from TIP, checks Node 22, runs only this package's pure test file plus one live acquisition, and retains source SHA, logs, per-step `EXITS` and artifact `SHA256SUMS`. No token is required for a public checkout/search; private repository access requires an already-enrolled Git transport. If GH_TOKEN is already present, acquisition uses it without printing it. No install, installer, posting or PR creation occurs. Network failures remain nonzero, including rate limits.

```sh
ROOT=/tmp/e07-fresh OUT=/tmp/e07-evidence TIP=<full-head-sha> BRANCH=codex/n7-e07-buyer-intent-20261105 bash tools/workflow-owned-extensions/buyer-intent-discovery/run-e07.sh
```

The VM runner has not been executed by the source writer. A pushed branch and passing local pure tests are not installed runtime or live acquisition evidence.

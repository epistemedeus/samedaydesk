Current independent audit: [CW43-AUDIT.md](CW43-AUDIT.md). The dated receipts below are historical.

# W4-commerce-11 receipt

Historical implementation receipt. The CW15 semantics hardening in the current
feature tree supersedes the tested-format and link-stub notes below; current
behavior and limits are authoritative in `FEATURE-MAP.md`.

Offline lockfile pin-delta job for SameDayDesk. Root-assigned branch `codex/w4-commerce-11-20260911`. Integration owner: Root.

## Source

- Repo: `epistemedeus/samedaydesk`
- Starting ref: `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`
- Feature branch: `codex/w4-commerce-11-20260911`
- Feature head: `7f8a5f6803d7709f646eb47a69306e4767febfe9` (implementation `811cd99012f95f2df25183d35ed112d448ba534a`)
- Compare: https://github.com/epistemedeus/samedaydesk/compare/main...codex/w4-commerce-11-20260911
- Draft PR: ManagePullRequest registered for operator approval (user settings blocked automatic open). Compare URL is the integration handle until the draft exists.
- Owned path only: `tools/lockfile-pin-delta/`
- Input refs checked on that starting tree:
  - `package-lock.json` present, `lockfileVersion` 3, `packages` map. Not modified.
  - `client/public/for-agents/useful-jobs/catalog.json` lists vendor-budget-impact as curated pricing rows, not lockfile integrity. Catalog not edited (outside ownedPaths).
  - `experiments/s134-record-jobs/README.md` still the S134 record-job CLIs. Not copied as a competing kernel.
- I01 / Neo PR54 earned-work hasher is not in this SDS checkout (`neomorphic-io` not attached). Local `createHashTermsAdapter` matches the integrated-terms contract: SHA-256 of canonical `{name, version, integrity}`. Original F01 (API upgrade brief) not wholesale-copied.

## Commands and counts

From `tools/lockfile-pin-delta/` with Node v22.14.0. No extra npm packages.

```bash
node --test --test-concurrency=1 test/*.test.mjs
# equivalent: npm test
```

Result: **23 pass, 0 fail**.

Caller journey (fixture):

```bash
node bin/lockfile-delta.mjs \
  --before fixtures/journey/before.json \
  --after fixtures/journey/after.json \
  --out-dir /tmp/lockfile-pin-delta-out
```

Seeded refusals:

```bash
node bin/lockfile-delta.mjs --before fixtures/html/not-a-lock.html --after fixtures/journey/after.json --out-dir /tmp/out
# exit 2, code html-input

node bin/lockfile-delta.mjs --before fixtures/sample-as-customer/before.json --after fixtures/sample-as-customer/after.json --out-dir /tmp/out
# exit 2, code sample-as-customer-delta
```

## Evidence classes

| Class | What ran | Not claimed |
| --- | --- | --- |
| Fixture | Journey bump of `fixture-alpha`; HTML; SAMPLE; missing integrity; v2 maps; package.json-only | Not a customer lock |
| Local-runtime | Parsed this repo's `package-lock.json` (160 pins, 1 missing integrity on the file: vendor package). Self-compare status `partial`. Zod integrity bump listed only that pin. Loopback HTTP served the same bytes into `parseLockfileText`. | Not npm install, not registry, not a hosted SDS path |
| External | none | No npm audit, no purchase, no live payment |

Postgres is not part of this job. No local Postgres server was used or faked.

## Seeded-failure coverage

- HTML input refuses (`html-input`)
- Lockfile pins without integrity labelled `partial`
- SAMPLE (sidecar + root name `SAMPLE`, or `--example --as-customer`) refused as customer delta
- package.json-only and lockfileVersion 1 also refuse (spec plus closed fail)

## Honestly untested

- Yarn/pnpm semantic parsing. Generated pnpm 12 and Yarn 1 locks now have an
  explicit `unsupported-lockfile-format` refusal rather than a generic JSON error.
- lockfileVersion 4+
- Binding a published I01 `hashRequest` (adapter is ready; sibling not on this main)
- Catalog / useful-jobs public page listing (outside ownedPaths)
- Deploy, live payment, customer messages

## Next integration owner

Root. Later catalog/job-wrapper binding can call `bin/lockfile-delta.mjs` or inject `createHashTermsAdapter`. Do not merge this branch into homepages, `server/pricing.js`, or other W4 owned trees from here.

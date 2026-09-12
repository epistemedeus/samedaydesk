# P02-express-docs source pin

Official pair for useful-jobs 1.4.0 `page-change-offline-job`.

## Repository

- Repo: `expressjs/expressjs.com`
- Path: `docs/content.md`
- License: **CC-BY-4.0** (Creative Commons Attribution 4.0 International), file `LICENSE.md`
- GitHub license API `spdx_id`: `CC-BY-4.0`
- Hint listed CC-BY-4.0 or MIT; recorded actual is CC-BY-4.0

## Revision pair

| Role | Full SHA | Commit date (UTC) | Message |
| --- | --- | --- | --- |
| before | `ba98cc468032c95cb397b11895537b1c893ac63a` | 2026-06-15T02:17:28Z | feat: add remark plugin to rewrite localized links in Markdown content (#2193) |
| after | `be31ea3fc5ba9e0d1b96d300894145ca4f6af57c` | 2026-06-21T18:00:42Z | feat: add CodeTabs component for displaying code snippets in multiple… (#2399) |

These are the assigned candidate SHAs, resolved to 40 hex via GitHub commits API. `be31ea3fc5ba` parent is `e26d1dce605d7ce9f6e04ea114039e5ae772275a`; the pair is a path-level revision compare, not a parent/child requirement.

## Retrieval

- Method: GitHub contents API metadata + `raw.githubusercontent.com` body (bounded, two SHAs, one path)
- Retrieved at: `2026-09-12T06:53:00.000Z`
- Not a live page fetch, not `--fetch`, not SDS hosted extract
- Not SDS `schema-validator.html` / `resources.html` / `/x402/verified`

## Stored fixtures (full blobs)

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `fixtures/raw/content.before.md` | 10653 | `f0cc5a783749bd138649db258629055f0376ca2219005d86a8cc99c69482b29b` |
| `fixtures/raw/content.after.md` | 11579 | `429e711995345d5af7a931d510d9c87fdd9e5816fa38955c3e262a74060bfbd5` |
| `fixtures/raw/LICENSE.md` | 18693 | `58064ebb41520d178054dea1a0bae72f48ced50607a6a8fbff6d381f80da8713` |

Git blob SHAs from contents API:

- before: `72310e75916f0a471f1f6cbb78ccb3e2ef346c50` (10653 bytes)
- after: `78ef7528842381e24fe92ede57391ba4bdb1f49e` (11579 bytes)

## Derived held extract-batch

Markdown is **not** `samedaydesk.extract-batch.v0`. Caller projection (`md-facts.mjs`) maps ATX title / headings / visible text into held batches:

- `fixtures/held/before.json`
- `fixtures/held/after.json`
- `fixtures/held/job.json` (clock `2026-09-12T12:00:00.000Z`, fields `title,headings,text`)

`claims.fresh` stays false. `charged` is false. Product `samedaydesk-extract-batch`.

## Proven fact

The only `docs/content.md` delta between the two SHAs is insertion of `## Code Tabs` plus dialect-tab documentation after the MDX components section. Title `Content` is unchanged. Independent witness: added `h2:Code Tabs`.

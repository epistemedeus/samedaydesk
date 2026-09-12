# R01-github-rest-routes result

Status: **pass** (8 tests, 0 fail)

## Source

- Repo: `github/rest-api-description` (MIT)
- Path: `descriptions/api.github.com/api.github.com.yaml` (OpenAPI 3.0.3)
- `f5d6d10f019dd94650dec88de32057f299411304` (2026-09-11) → `e16cc2584c6d32e8cd4d461759e1475e79327d6c` (2026-09-12)
- Full yaml 9 843 603 → 9 858 123 bytes; sha256 recorded in `SOURCE.md` / `fixtures/official/full-blob.json`. Subset only is stored (15 used ops).

Not OpenAI. Not Octokit `organization.renamed`.

## Engine vs witness

| Layer | Equality | Outcome |
| --- | --- | --- |
| Independent witness | method+path+operationId set | informational, 15 unchanged |
| `api-upgrade-brief` 1.4.0 | used-op structural fingerprint | **actionable** `+0/~2/-0` |

Changed used ops (engine): `GET /repos/{owner}/{repo}/labels/{name}`, `POST /repos/{owner}/{repo}/labels` because official `label` schema adds required `archived_at` / `archived_by`.

This is not a kit misclassification and not a runtime compatibility proof.

## Controls / negatives

- Identical before=after: informational (`no-used-op-delta`)
- Unused-pointer (git blob/commit/tree/ref only): informational
- Missing `--used`: `missing-required-inputs`
- Raw OpenAPI → `route-table-diff`: `unsupported_catalog`
- Labeled SDS projection (method dropped): `no-change`

## Honesty

No purchase, live fetch, or scheduler. Projection to `samedaydesk.route-table.v1` is **not equivalent** (HTTP method dropped; GET+POST collapse).

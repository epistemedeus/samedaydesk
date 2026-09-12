# R01-github-rest-routes source

Official repository: [github/rest-api-description](https://github.com/github/rest-api-description)
Path: `descriptions/api.github.com/api.github.com.yaml` (JSON sibling `api.github.com.json`)
License: MIT (`LICENSE.md` at both SHAs, git blob `b50625eb63949013cae604b1cadd42cfa1eaf825`)

This is GitHub's REST API OpenAPI 3.0.3 description. **Not OpenAI routes. Not Octokit `organization.renamed`.**

## Revisions (full 40-char SHAs)

| Role | SHA | Date (UTC) | Subject |
| --- | --- | --- | --- |
| before | `f5d6d10f019dd94650dec88de32057f299411304` | 2026-09-11T16:56:47Z | Update OpenAPI 3.0 Descriptions |
| after | `e16cc2584c6d32e8cd4d461759e1475e79327d6c` | 2026-09-12T04:12:34Z | Update OpenAPI 3.0 Descriptions |

Resolved via GitHub REST `GET /repos/github/rest-api-description/commits/{sha}` (prefixes `f5d6d10f019d` / `e16cc2584c6d`). After is later on `main`; OpenAPI 3.1 commits sit between them and do not replace this 3.0 file pair.

## Retrieval

- Method: GitHub Contents API + `raw.githubusercontent.com` (two SHAs × yaml+json + LICENSE.md). No full clone, no mass scraping.
- Retrieved at: `2026-09-12T06:58:38Z`
- Job path never fetches; stored excerpts are the only inputs

## Full official blobs (not committed)

Multi-MB specs are hashed and discarded. Do not treat the subset as the full description.

| Blob | bytes | sha256 | git blob |
| --- | ---: | --- | --- |
| before yaml | 9843603 | `7254025ca236412eec84f215ad61e706ede8ddffc00826ec6b61f553b6bd1e94` | `5f3f175337fa8debc4bff807bf3915e6f12cf56f` |
| after yaml | 9858123 | `51fa18cb44368560881cf1e6f7efe82ffe82f2bafb3c66df2bb650619b64bf07` | `6a0c96aed0564c545744607ba745113a1c44db68` |
| before json | 12939954 | `d779aab588af4c00bf3945342937358f715242f4c62390c3d27919ef840afbee` | `67aebc6f48043ce5f4d151247be5b347ac7869b6` |
| after json | 12958925 | `4340ac8202faa2cfe78eee40e0ff38fd08375ed6ed8507bfc43f720f0ee6df95` | `76261e8184764c6da524954c392ad6578cc0c039` |
| LICENSE.md | 1063 | `3243761cbac07e6d169a5a2f4e7c25cc544da85248e735df74c3672e055cc87b` | `b50625eb63949013cae604b1cadd42cfa1eaf825` |

## Stored fixtures (bounded used-ops subset)

JSON-encoded OpenAPI 3.0.3 excerpts (valid YAML 1.2; `loadOpenApi` JSON-parses documents that start with `{`). 15 used operations around issues / pulls / git, plus the local `$ref` closure (schemas/parameters/responses/headers; examples omitted).

| File | bytes | sha256 |
| --- | ---: | --- |
| `fixtures/openapi/before.yaml` | 187714 | `8a25fb335b2dcc049b6d0e6c6b3ca52097ab4ae0ee0d87081f68f9a50df9baa8` |
| `fixtures/openapi/after.yaml` | 189586 | `63681f235cc7124c2377443ca1cc13c8c801d70de805f7fae00cef3e4912d7f5` |
| `fixtures/openapi/used.json` | 2067 | `9640f65adedbf9c0976cf1ce38153b9550eb3e303f06f8a69d754a011c826856` |
| `fixtures/openapi/used-control-git.json` | 771 | `c0a34b493202e327598c5765c268f9d906188c549750816beeb49c30ae562e89` |

Method+path+operationId set is identical across the pair (1229 ops in the full spec; 15 selected). Official `components.schemas.label` adds required `archived_at` and `archived_by`. Root `$ref` responses for `GET /repos/{owner}/{repo}/labels/{name}` and `POST /repos/{owner}/{repo}/labels` therefore change under the engine fingerprint. Array-item `$ref` to `label` (list-labels-on-issue) is not walked by the engine.

## Honesty

- Independent witness = set of method+path (+ operationId). It reports **unchanged**.
- `api-upgrade-brief` fingerprints parameters / requestBody / responses and reports **actionable** (`+0/~2/-0`) on the two label object ops. That is a different dimension, not a runtime compatibility proof, not a kit-engine bug.
- Projection into `samedaydesk.route-table.v1` drops HTTP method; GET+POST on one path collapse. **Not equivalent.** `route-table-diff` refuses raw OpenAPI (`unsupported_catalog`).
- No purchase, live GitHub API calls, or scheduler.

# S01-jsonschema-recursive-anchor source pin

Official JSON Schema meta-schema pair for useful-jobs 1.4.0 `json-schema-webhook-drift`.

## Repository

- Repo: `json-schema-org/json-schema-spec`
- URL: https://github.com/json-schema-org/json-schema-spec
- Path: `schema.json` (repo-root meta-schema, draft/next)

## Revisions (full SHAs)

| Role | Full SHA | Commit title | Committer date |
|------|----------|--------------|----------------|
| before | `63fbd7bf561a6ef04a38fd63589a3d93d1c149ff` | fix broken reference (`$recursiveRef` local type/format) | 2022-07-08T15:25:37Z |
| after | `c028e943ab213531f55e60ff6a2b1202f5d443c6` | fix the type for `$recursiveAnchor` | 2022-10-30T22:24:34Z |

Resolved from GitHub Commits API using the assignment prefixes `63fbd7bf561a` and `c028e943ab21`.

This is **not** the H04 exclusiveMinimum pair (`d4c5b3a2` → `4b495a29` / draft-04→draft-06 `exclusiveMinimum`).

## Provenance of the change

At `/properties/$recursiveAnchor`:

- before: `{ "$comment": "...", "$ref": "meta/core#/$defs/anchorString", "deprecated": true }`
- after: `{ "$comment": "...", "type": "boolean", "deprecated": true }`

Verified JSON Pointers:

- `/properties/$recursiveAnchor` — keyword object (exists in both revisions)
- `/properties/$recursiveAnchor/type` — absent before; `"boolean"` after
- `/$recursiveAnchor` is **not** present at document root (would be absent-in-both)

`$ref: "meta/core#/$defs/anchorString"` is a **remote** `$ref` (does not start with `#`). The engine refuses that pointer. Independent witness still records the type axis change on the keyword object. Comparable engine input uses `/properties/$recursiveAnchor/type`.

Control pointers unchanged across the pair: `/properties/$recursiveRef/type`, `/title`, `/type`.

## License (actual at SHA)

LICENSE file is **absent** at both SHAs (GitHub Contents API 404).

README.md at after SHA § License:

> The source material in this repository is licensed under the AFL or BSD license.

Assignment hint `Apache-2.0 OR BSD-3-Clause` is **not** the text at these SHAs.

Later main commit `51326f80900357fe3069beb4f5f575db24c1b9a7` (2022-10-10) specifies BSD-3-Clause and AFL-3.0. GitHub compare vs after SHA: **diverged** (that LICENSE commit is not in the after tree). Do not treat later LICENSE bytes as present at `c028e943ab21`.

## Retrieval

- Method: GitHub REST `GET /repos/json-schema-org/json-schema-spec/commits/{sha}` and `raw.githubusercontent.com` for `schema.json` and `README.md`
- Retrieved at: `2026-09-12T06:50:00Z`
- No mass scraping. Bounded files only.

## Stored fixture bytes / sha256

See `acquisition.json`. Official blobs:

- `fixtures/official/schema.before.json` — 2435 bytes — `a5b3239c1785903a0edb2e1e8cae3e6da4128bb80ab33cf0ce962b5920e3470d`
- `fixtures/official/schema.after.json` — 2413 bytes — `d53747379d6c5b18a555c87918a588ca4311bfc03ff46bb57ce2714f0692e462`

## Kit

useful-jobs 1.4.0 extracted under `vendor/useful-jobs-1.4.0/` from `/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz` (sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`, 2575215 bytes). Engine sources were not edited.

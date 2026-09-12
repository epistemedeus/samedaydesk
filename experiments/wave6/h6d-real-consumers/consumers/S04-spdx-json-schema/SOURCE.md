# S04 SPDX JSON Schema — source pin

Official SPDX JSON Schema pair used as a **versioned official pair**, not a fake git delta.

## Repository

- GitHub: https://github.com/spdx/spdx-spec
- Path pair: `schemas/spdx-schema-2-3.json` vs `schemas/spdx-schema-3-0-1.json`
- Restore commit (holds both files): `61a7a341f2533d6e084c48c88463da63f05e1af0`
- Commit date: 2026-04-24T14:28:03Z
- Subject: Restore schemas directory (IANA / SPDX 2.3 conformance references)
- HTML: https://github.com/spdx/spdx-spec/commit/61a7a341f2533d6e084c48c88463da63f05e1af0

`beforeSha` and `afterSha` are the same 40-char SHA because SPDX 2.3 and 3.0.1 schemas are maintained side-by-side in that restore commit. That is the assigned official pair.

## License (actual LICENSE at the pin)

Recorded from `LICENSE` at `61a7a341f2533d6e084c48c88463da63f05e1af0`:

- SPDX Specification: **Community Specification License 1.0** (`Community-Spec-1.0`)
- Pre-existing portions from copyright holders who have not subsequently contributed under Community-Spec-1.0: **Creative Commons Attribution 3.0 Unported** (`CC-BY-3.0`)
- `bin/pull-license-list.py`: **MIT**

Full text stored at `fixtures/official/LICENSE` (35886 bytes, sha256 `8b9e88199429dc9fc3c87604bdb9008c640829a3b5f6b8bd40ba3d0e8b5ca987`). Header excerpt: `fixtures/excerpt/LICENSE.head.txt`.

## Retrieval

- Method: GitHub REST contents + raw.githubusercontent.com GET at the pin SHA (no git clone of the whole repo)
- Retrieved at: 2026-09-12T06:54:12Z
- Contents API: https://api.github.com/repos/spdx/spdx-spec/contents/schemas?ref=61a7a341f2533d6e084c48c88463da63f05e1af0
- Raw 2.3: https://raw.githubusercontent.com/spdx/spdx-spec/61a7a341f2533d6e084c48c88463da63f05e1af0/schemas/spdx-schema-2-3.json
- Raw 3.0.1: https://raw.githubusercontent.com/spdx/spdx-spec/61a7a341f2533d6e084c48c88463da63f05e1af0/schemas/spdx-schema-3-0-1.json
- Raw LICENSE: https://raw.githubusercontent.com/spdx/spdx-spec/61a7a341f2533d6e084c48c88463da63f05e1af0/LICENSE

## Stored fixtures (byte / sha256)

| File | bytes | sha256 |
|------|------:|--------|
| fixtures/official/spdx-schema-2-3.json | 45305 | `ca7fd7cc2c8107c3b6b5976058bb72363e8c072f0e446609d4fe7234860c2894` |
| fixtures/official/spdx-schema-3-0-1.json | 235595 | `19d65705ee474fb99467b5e006e05cab61b561974da34ff0e4a188bcf039387c` |
| fixtures/official/LICENSE | 35886 | `8b9e88199429dc9fc3c87604bdb9008c640829a3b5f6b8bd40ba3d0e8b5ca987` |
| fixtures/official/schemas-README.md | 315 | `f500752c6059642d801bbfd92c5f9c00ab7995baa6b2f73e9b5eeb79e8206d8f` |
| fixtures/official/commit.json | 670 | `f8a8180f06b54bfd3f8ab79380786ed4d5c67ad08358eb1bfc61bc2ba68a1ea0` |
| fixtures/used/positive.json | 383 | `6ce4b95b85572e893478a23c3985848887c268663df034ccd8e5626a07bf95ac` |

Git blob SHAs from Contents API (not sha256): 2.3 `0ca1c7b56bebb10fb637285698e401342b4910d6`; 3.0.1 `d61124dbb66435d1ac05ebcee1e08cdcf3269af5`.

Excerpts of top-level schema shape (full blob sha256 recorded above): `fixtures/excerpt/spdx-schema-2-3.top.json`, `fixtures/excerpt/spdx-schema-3-0-1.top.json`.

## Used pointers

Pointers that exist in **both** documents:

- `/type` — `"object"` in both (unchanged)
- `/$schema` — draft-07 vs 2020-12 (value change)
- `/properties` — 2.3 document fields vs 3.x `@context` map (value change)

2.3-only instance-schema fields (removed at these JSON Pointers):

- `/properties/name`
- `/properties/spdxVersion`

3.x-only (added):

- `/properties/@context`
- `/$defs`
- `/oneOf`

## Job honesty

- Job: useful-jobs 1.4.0 `json-schema-webhook-drift`
- Not OpenAPI; YAML OpenAPI refuses (`not-json` — this job has no YAML parser). JSON OpenAPI refuses `not-this-job-openapi`.
- Not a runtime compatibility proof of SPDX 2.3 documents vs SPDX 3.0.1 documents.
- SAMPLE/`--example` is not this customer pair.
- purchaseAuthority=false. No live fetch on the job path.

## Kit

- Archive: `/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz`
- sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` (2575215 bytes)
- Extracted read-only under `vendor/useful-jobs-1.4.0/`

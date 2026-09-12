# S03-cyclonedx-bom-schema source

Official JSON Schema for OWASP CycloneDX BOM documents.

- Repo: `CycloneDX/specification` (https://github.com/CycloneDX/specification)
- License: **Apache-2.0** (file `LICENSE` at both recorded SHAs; Apache License Version 2.0, January 2004). Assignment hinted Apache-2.0 or CDDL; the stored LICENSE blob is Apache-2.0 only. Schema `$comment` also states Apache License 2.0.
- Retrieval: GitHub REST (`/commits/{sha}`, `/git/matching-refs/tags/1.`, `/contents/LICENSE`) plus `raw.githubusercontent.com` GET of four schema blobs and LICENSE. No other scrape.
- Retrieved at: `2026-09-12T06:57:00Z`

## Pair A — same filename, annotation-only (assigned SHA pair)

Path: `schema/bom-1.6.schema.json`

| Role | Full SHA | Commit |
| --- | --- | --- |
| before | `80db0257f1182a2d4220b3a2ab6970f4bab824df` | 2026-02-07 ratings description wording |
| after | `0bd48c88d1b1877c7a3536252e06893850763190` | 2026-02-25 content-type / refType typo |

These SHAs are not parent/child. The **file-level JSON diff** between the two trees is still only two annotation strings:

1. `/definitions/attachment/properties/contentType/description` — `plan text` → `plain text`
2. `/definitions/refType/$comment` — `staring with` → `starting with`

BOM-root `/required` stays `["bomFormat","specVersion"]`. No type/enum/required/properties structural change on this filename.

Used structural pointers are therefore unchanged. That is a valid informational / compatible-unchanged result, not a fake delta.

## Pair B — official spec versions, different filenames

Maintained tags, not the same filename:

| Role | Tag | Full SHA | Path |
| --- | --- | --- | --- |
| before | `1.5` (`refs/tags/1.5`) | `c320fc0f0b46873864927d9d5684eea7ba439728` | `schema/bom-1.5.schema.json` |
| after | `1.6` (`refs/tags/1.6`) | `55343ba19dee1785acf1ce9191540d5fd7b590db` | `schema/bom-1.6.schema.json` |

Proven used-pointer facts from the files (not invented):

- `/definitions/component/properties/type` enum **gains** `cryptographic-asset` (enum-weakened / compatible)
- `/properties/declarations` **added** in 1.6
- `/definitions/component/properties/cryptoProperties` **added** in 1.6
- `/definitions/component/required` stays `["type","name"]`
- `/definitions/attachment/properties/contentType` equal across the tags
- `/definitions/refType/type` stays `"string"`
- BOM-root `/required` drops `version` in 1.6 (`["bomFormat","specVersion","version"]` → `["bomFormat","specVersion"]`). That is a **compatible required-removal**, not a breaking required-add. It is recorded in excerpts and is **not** used as a breaking claim.

## Stored fixtures (full blobs + sha256)

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `fixtures/official/bom-1.6.80db0257f118.json` | 262664 | `d26777d246211e1fac7160949b8769c5176f13f5eeb658d3136354d67c0a73e4` |
| `fixtures/official/bom-1.6.0bd48c88d1b1.json` | 262666 | `18f57f7482593bad9f21b4feed09084640cbeff419d62ad5090c5ceccca5b37d` |
| `fixtures/official/bom-1.5.c320fc0f0b46.json` | 164769 | `067f7824b08653839ea050ae9e09ca48375eadc2652b0e2a299476e7db90335b` |
| `fixtures/official/bom-1.6.55343ba19dee.json` | 252625 | `3e92dddbc30cf7f6a02b80f0942b1a4cfd4fb1c26f1dfc4310afa9d613cafb93` |
| `fixtures/official/LICENSE` | 11341 | `6c29f22a4a7385285c6f579ec9f33c5e989f00739d6b257243a0b082ec9447ae` |

Pointer excerpts: `fixtures/excerpts/pointer-proof.json`.

useful-jobs 1.4.0 kit (read-only published bytes): sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` (2575215 bytes), extracted to `vendor/useful-jobs-1.4.0/`.

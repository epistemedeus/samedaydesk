# R02 source pin — stripe/openapi

Official pair, not SAMPLE, not OpenAI.

| Field | Value |
| --- | --- |
| Repo | [stripe/openapi](https://github.com/stripe/openapi) |
| Path | `openapi/spec3.yaml` (GA v1 spec; JSON sibling `openapi/spec3.json` used only to project excerpts) |
| Before SHA | `af5309cae53e5f666f9686dfed306d6d3b5fdc67` (2026-07-29T18:38:34Z, info.version `2026-07-29.dahlia`) |
| After SHA | `30d3391cc09a0f67ad29bee002f570811b19e1da` (2026-08-26T17:57:44Z, info.version `2026-08-26.dahlia`) |
| License | **MIT** (`LICENSE`, Copyright 2011– Stripe, Inc.) |
| Retrieval | GitHub REST `commits/{sha}` + `contents/openapi/spec3.yaml?ref={sha}`, then raw GET of the blob |

## Full-blob provenance (not stored)

The GA YAML files are multi-megabyte. Stored artifacts are bounded used-ops excerpts. Full-document bytes were hashed locally after download; sizes matched the contents API.

| File | Bytes | sha256 | git blob SHA-1 |
| --- | ---: | --- | --- |
| before `openapi/spec3.yaml` | 6364174 | `707de00b0616e606fa4a388ce840ff6cb2dd0bafe7abb1c2cc6da8b6d8a2f76e` | `af83746c4127e796001c415467aab22bdba49e8d` |
| after `openapi/spec3.yaml` | 6409430 | `2e0ce56f026b1862dd772061c839a2c8ca9cc3e180f8bb22d7694b8ba214d203` | `18566899c6efa112dc63563f1446ca430906642c` |
| before `openapi/spec3.json` | 7967776 | `3653ad45bbec54fcbe461c541c908355b715018bdf455a0e11b27bedb2cbdee5` | `92c4d0de7cafefbb253ab4b31bb970b4cb89b4a3` |
| after `openapi/spec3.json` | 8028700 | `f0e0fc8fffbffda45bf5f3df59846443c1d47a3cfcbfae232eedf4743124ebee` | `622c8d69a50f470944ab6713c7f27e216cb45d97` |
| `LICENSE` | 1095 | `8c1ce883f4eee7b531e0b7872dbfc72d410ced87dfff9501305de05ca8d203e5` | `edf2d132d8bb95146e05585c3a782d059298b46b` |

Machine copy: `fixtures/provenance/full-blob.json`.

## Stored excerpts

JSON-encoded OpenAPI 3.0.0 (YAML 1.2 subset) of 13 used operations around `/v1/customers`, `/v1/charges`, `/v1/payment_intents`. Component schema graph omitted.

| File | Bytes | sha256 |
| --- | ---: | --- |
| `fixtures/openapi/before.yaml` | 165957 | `182caeb8913cea45a5d371ca5c16abae6b3b861cbaf145af065ac986cef17a54` |
| `fixtures/openapi/after.yaml` | 166129 | `2b2dde6b666be91e9ece5e73907d6db9879fb0ca1a44b23b9c42c7394cb19162` |
| `fixtures/used.json` | 1411 | `f1ed0f1855dfb7f442eda45d05b8d0e91f946dad5506fed2ba0b149ba87445d7` |
| `fixtures/LICENSE` | 1095 | `8c1ce883f4eee7b531e0b7872dbfc72d410ced87dfff9501305de05ca8d203e5` |

Used method+path set is identical in both snapshots. Nested requestBody still differs (see `fixtures/observed-nested-deltas.json`): `touch_n_go` added to PaymentIntent `allowed_payment_method_types` enum; `billie` added under customer subscription `payment_settings.payment_method_options`.

## Honesty

- Fixture OpenAPI, not a live Stripe call, not a customer, not purchase authority.
- Not a runtime compatibility proof.
- OpenAPI method+path is not an SDS `{path,canonical,title}` route table.
- useful-jobs 1.4.0 `--example` SAMPLE trees were not used as the official pair.

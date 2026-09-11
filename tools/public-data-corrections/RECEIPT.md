# W3-14 / H03 RECEIPT — rights-cleared public-data corrections

**Date:** 11 September 2026
**Branch:** `fable/w3-14-h03-public-data-corrections`
**Own directory:** `tools/public-data-corrections/`
**Base:** `main` (SDS PR50 consumer surfaces are public; PR51 useful-jobs catalog)

## What

Local CLI that accepts a **public** document fixture and one correction packet.
Verified useful collection without private data.

- `rights`: `cleared | unknown | forbidden`
- `privateData: false` is required
- unknown rights cannot publish
- corrections cite a public URL + `observedAt` + digest
- `publishAuthorized` is always `false`

Public citation in `fixtures/ok.json` is the PR50/PR51 consumer catalog
`https://samedaydesk.com/for-agents/useful-jobs/catalog.json`, verified against
`client/public/for-agents/useful-jobs/catalog.json`.

## Literal journey

```sh
cd tools/public-data-corrections
node bin/public-data-corrections.mjs journey --fixture fixtures/ok.json
```

Public catalog snippet + one field correction (`runtime.purchaseAuthority`
true → false) → `{ ok: true, rights: "cleared" }` with `publishAuthorized: false`.
A packet containing an email/address is rejected as private data.

## Commands / pass-fail

```sh
cd tools/public-data-corrections
node --test
```

**PASS** — 19 tests, 0 fail (`node --test` in `tools/public-data-corrections`).

Seeded fail-closed: private data in the collection; unknown rights labelled
cleared; SAMPLE as customer-owned; auto-publish; inventing a paying rights
holder.

## Gaps

- No deployment, payment, or secrets.
- No live fetch or private-customer scrape.
- F08, homepage, and H3 Neo pack were not touched. H3 Neo ledger is out of
  directory.
- Cleared rights still do not authorize publish.

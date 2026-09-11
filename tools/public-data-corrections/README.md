# Public-data corrections (W3-14 / H03)

Rights-cleared **public** collection only. SDS PR50 consumer surfaces are public.
This tool does not scrape private customer data. H3 Neo ledger is out of directory.

`privateData` must be `false`. Rights are `cleared | unknown | forbidden`.
Unknown rights cannot publish. Corrections must cite a public URL, `observedAt`,
and a `sha256` digest. `publishAuthorized` is always `false`.

## Literal user journey (copy-paste, offline)

```sh
cd tools/public-data-corrections
node bin/public-data-corrections.mjs journey --fixture fixtures/ok.json
```

Journey: public catalog snippet + one field correction → `{ ok: true, rights: "cleared" }`
with `publishAuthorized: false` → packet containing an email/address is rejected as
private data.

Check one packet:

```sh
node bin/public-data-corrections.mjs check --fixture fixtures/ok.json
```

## Tests

```sh
cd tools/public-data-corrections
node --test
```

Seeded fail-closed:

1. private data in the collection
2. unknown rights labelled cleared
3. SAMPLE as customer-owned
4. auto-publish
5. inventing a paying rights holder

## Out of scope

No deployment, payment, secrets, F08 wrappers, homepage, or H3 Neo pack.
No live fetch. SAMPLE is not customer-owned. The tool never auto-publishes.

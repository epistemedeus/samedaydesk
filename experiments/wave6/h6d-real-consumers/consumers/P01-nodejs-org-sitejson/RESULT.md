# P01-nodejs-org-sitejson

Status: **pass**. `node --test test/consumer.test.mjs` → 9 pass / 0 fail.

## Pair

Official `nodejs/nodejs.org` `apps/site/site.json`:

- before `aad2540a476ff94fa8419dc3a0a5e37c413b2ee1` (2026-07-29 security-release blog)
- after `71f7fdc56a1c9381abc5da60d991c089f8891893` (2026-08-19 Next 10 survey badge)
- MIT

Both revisions keep title `"Node.js"`, the same description, and the July 2026 security-release banner. `websiteBadges.index` moves from `"Discover"` / `"New migration guides"` to `"Be Heard"` / `"Take the Node.js User Survey 2026"`.

## Job

Held `samedaydesk.extract-batch.v0` wrappers (`product` `samedaydesk-extract-batch`, `charged` false) compared with useful-jobs 1.4.0 `page-change-offline-job`. Clock `2026-09-12T12:00:00.000Z`. Selected fields: `title`, `description`, `text`, `jsonLd`, `headings`.

- Positive verdict: **changed** (`/text`, `/headings/h2`, `/jsonLd/hasPart`)
- Control (identical batches): **unchanged**, `noChangeProven` true
- `claims.fresh` false on both
- Missing clock → `clock_required` (exit 2)
- Live URL / `--fetch` → `live_fetch_url` (exit 2)
- `--example` → `sample_as_delivered_watch` (exit 2)

Independent witness agrees: changed `{text, jsonLd, headings}`, unchanged `{title, description}`. No regression artifact. Engine was not edited.

## Honesty

The site.json → extract-batch mapping is **not equivalent** to HTML extract or a live homepage snapshot (`html-to-extract-batch`). This job does not fetch, pay, or treat SAMPLE as a delivered watch. Not SDS `schema-validator.html`, `resources.html`, or `/x402/verified`.

Receiving integration owner: H6D parent catalog + `bin/select-job.mjs`.

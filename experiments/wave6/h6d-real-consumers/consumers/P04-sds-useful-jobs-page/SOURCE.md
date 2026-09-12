# P04 SDS useful-jobs page source

Official pair from **local git only** (no GitHub API, no live page fetch).

| Field | Value |
| --- | --- |
| Repo | `epistemedeus/samedaydesk` |
| Path | `client/src/pages/UsefulJobs.tsx` |
| First-byte shell | `client/src/data/machineEntry.mjs` `USEFUL_JOBS_TITLE` / `USEFUL_JOBS_DESCRIPTION` (served via `server/lib/spa-route-shells.js`) |
| Public path | `/for-agents/useful-jobs` |
| Before SHA | `abeb54eca9a71abe117898e8fe7de7e55e9d917f` (S260 useful-jobs surface, 2026-09-10T18:56:00Z) |
| After SHA | `ad9bc7b448cf1f635ff1488affbe206aaf981ac0` (1.4.0 overlay, 2026-09-12T04:31:34Z) |
| Method | `git show <sha>:path` in `/tmp/h6d/wt` |
| License | MIT in-tree kit `LICENSE` (`fixtures/raw/LICENSE.kit-mit.txt`). SDS root `LICENSE` is absent at both SHAs. Assignment hint: MIT (in-tree). |
| Clock | `2026-09-12T12:00:00.000Z` (required; not live freshness) |
| `claims.fresh` | false |
| `charged` | false |
| `--example` | refused |

## Projection (not equivalent)

TSX + first-byte shell → `samedaydesk.extract-batch.v0` selected fields `title`, `description`, `headings`. Dropped: unselected markup, live freshness, payment. HTML is not extract-batch.

- **title / description**: first-byte `USEFUL_JOBS_SHELL` (document title + meta description).
- **headings**: `UsefulJobs.tsx` visible `h1` / `h2` text (whitespace collapsed).

Title is unchanged across the pair. Description and headings change (six-job S260 copy → ten-job 1.4.0 overlay, including page-change `--example` refused).

Not H04 `client/public/tools/schema-validator.html`, `client/public/resources.html`, or `/x402/verified`.

## Full-blob pins (git cat-file)

| Side | Path | bytes | sha256 | git blob SHA-1 |
| --- | --- | --- | --- | --- |
| before | `client/src/pages/UsefulJobs.tsx` | 8369 | `b1818a2e4e76c8bac182cb3ec99585dc9e8ab9e082d0a560db33e24c1e288a93` | `c39270b86b17f25544c1dbfb131a8e61484818b3` |
| after | `client/src/pages/UsefulJobs.tsx` | 10287 | `1401dfd46246e3e005f33d014f801a52f9d0a180e76d08835791789bfcb9de78` | `603f8012115ab67bbb3550216bfbf88dbc82d0d9` |
| before | `client/src/data/machineEntry.mjs` | 38178 | `2eeb72f76bdd932eaf9b62447ae3200cda2fd849debf224621dac16820cf2ce0` | `04dacc506f3208654b6dbfc7da58e28cf452c0ea` |
| after | `client/src/data/machineEntry.mjs` | 39711 | `25f81be95fa9c86e28343ba5f5c8db5951e839e9f8afe9ed3b7ad23ce71ebf84` | `17d1af20bf577cb8238b9c0c2ef7fca440a5557f` |

`machineEntry.mjs` is stored as bounded excerpts (`USEFUL_JOBS_*` title/description/crawler/shell only). Full-blob sha256 is recorded above.

## Stored fixtures

| Path | bytes | sha256 |
| --- | --- | --- |
| `fixtures/raw/UsefulJobs.before.tsx` | 8369 | `b1818a2e4e76c8bac182cb3ec99585dc9e8ab9e082d0a560db33e24c1e288a93` |
| `fixtures/raw/UsefulJobs.after.tsx` | 10287 | `1401dfd46246e3e005f33d014f801a52f9d0a180e76d08835791789bfcb9de78` |
| `fixtures/raw/machineEntry.useful-jobs.before.excerpt.mjs` | 3496 | `fca49b85fe883a43567c4d12b4fe4e5085da6a70ad80cecc6d83259d28b4bbc1` |
| `fixtures/raw/machineEntry.useful-jobs.after.excerpt.mjs` | 3771 | `419282645fae98fa9a02d5bcacf3343a2316d7c1898a2bb347ee68839d8ed7dd` |
| `fixtures/raw/LICENSE.kit-mit.txt` | 1106 | `fa970560dc52345f61b1710dde20210405a2f226acb34e3956cbc14aa64ff7af` |
| `fixtures/held/before.json` | 3697 | `4c976546706d15022783acfa054be6ab21ec367142a22ea86a3645ebba1a0c8d` |
| `fixtures/held/after.json` | 3794 | `ba8868bef2b2d3c5b37b317c7379c5d456ffd62794b38336ec483330f0a155a7` |
| `fixtures/held/job.json` | 548 | `1025219d150393aaf23e1cf0e355a8f2d5d862cc296266085a12b8d8fa61c9fd` |
| `fixtures/held/facts.json` | 1993 | `71b28f9362d3007e85da393c0a3346496d40c0b651a7fdceb3d31389bc37b365` |
| `fixtures/control/job.json` | 356 | `a52e0738c9a3f8ebab759c40fe41dbf8b83436258998932ee4d85dd468463fbb` |
| `fixtures/negative/missing-clock.job.json` | 280 | `98d9b8f8828a001c4b053a5752efa9d13d2c3e5b2b12b5230b5198912a3fef9e` |

## Kit

- `/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz`
- 2575215 bytes
- sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`
- extracted to `vendor/useful-jobs-1.4.0/`

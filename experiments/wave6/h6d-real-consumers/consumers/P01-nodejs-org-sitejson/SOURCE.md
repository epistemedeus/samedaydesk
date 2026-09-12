# P01-nodejs-org-sitejson source

Official pair for useful-jobs 1.4.0 `page-change-offline-job`.

## Repository

- Repo: [nodejs/nodejs.org](https://github.com/nodejs/nodejs.org)
- Path: `apps/site/site.json`
- License: MIT (`LICENSE` at after SHA; SPDX `MIT`)
- Retrieval: GitHub REST (`/commits/{sha}`, `/contents/apps/site/site.json?ref=`, `/license?ref=`) plus `raw.githubusercontent.com` for the decoded JSON bytes. No live nodejs.org fetch. No scraping.

## Revisions

| Role | Full SHA | Committer date | Subject |
| --- | --- | --- | --- |
| before | `aad2540a476ff94fa8419dc3a0a5e37c413b2ee1` | 2026-07-29T14:26:33Z | Blog: announce successful Node.js security release (#9045) |
| after | `71f7fdc56a1c9381abc5da60d991c089f8891893` | 2026-08-19T21:34:28Z | Add Next 10 survey as badge (#9110) |

Git blob SHA for `apps/site/site.json`:

- before blob `4e63228b157a24b64cc8b09c4e0619ecaf61f8f9`
- after blob `94f8835767196cffaf8a7e0a8fd44038fb3a0c53`

## Primary-source fact

Both revisions keep `title` `"Node.js"`, the same `description`, and the same homepage banner text `"July 2026 security releases are available"`.

`websiteBadges.index` changes:

- before: title `"Discover"`, text `"New migration guides"`, link `https://nodejs.org/en/blog/migrations`
- after: title `"Be Heard"`, text `"Take the Node.js User Survey 2026"`, link `https://linuxfoundation.surveymonkey.com/r/nodejs-users-2026`

That badge delta is the Next 10 survey badge. Mapping it onto extract-batch selected fields is **not equivalent** to HTML extract or a live page snapshot.

## Stored fixtures (bytes / sha256)

| File | bytes | sha256 |
| --- | ---: | --- |
| `fixtures/official/site.before.json` | 1397 | `e1efb807efdc83fe7637a294d0e2faee1f7c4c1e3a8e30112614ac395007bdeb` |
| `fixtures/official/site.after.json` | 1433 | `8b6948b93b60fc1c546eff87d3802eb98b7d44feec698247b2a90ad8178430d0` |
| `fixtures/official/LICENSE` | 1101 | `521edd5b3dddc33947eb8c5e988eeca99c986ea0f70cd6817ab8e553895feaf3` |
| `fixtures/batches/before.json` | 3632 | `3ae191b9ef4dae2f1f62a7723b26f465f8a395bdd5d12602a64207fd9dab2f45` |
| `fixtures/batches/after.json` | 3681 | `d88e7a0a43bd9bd0636f6e495aec910202445a23908223842fcdbc460362e6e3` |

## Held extract-batch mapping

Caller-owned projection onto `samedaydesk.extract-batch.v0`:

- `title` ← `site.title`
- `description` ← `site.description`
- `text` ← banner text + badge title + badge text
- `headings` ← `{ h1: [title], h2: [banner.text, badge.title] }`
- `jsonLd` ← WebSite + WebPageElement parts for banner and badge

Product `samedaydesk-extract-batch`. Clock required on the job document. `charged` false. `claims.fresh` stays false. No live URL / `--fetch` / `--example`.

## Kit

- Archive: `client/public/kit/useful-jobs-1.4.0.tar.gz`
- sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`
- 2575215 bytes
- Extracted under this consumer as `vendor/useful-jobs-1.4.0/`

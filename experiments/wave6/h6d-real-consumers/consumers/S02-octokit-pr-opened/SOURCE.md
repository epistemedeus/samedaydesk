# S02-octokit-pr-opened source

Official webhook EXAMPLE json pair for useful-jobs 1.4.0 `json-schema-webhook-drift`.
Not OpenAPI. Not JSON Schema meta-schema `exclusiveMinimum`. Not `organization.renamed`.
Not `create/payload.json` (H04).

## Official repository

- Repo: `octokit/webhooks`
- URL: https://github.com/octokit/webhooks
- Path: `payload-examples/api.github.com/pull_request/opened.payload.json`
- License: MIT (`spdx_id` MIT via GitHub license API at after SHA)
- LICENSE copyright at after SHA: Copyright (c) 2018 Gregor Martynus

## SHAs (full 40-char)

| Role | SHA | Commit |
|------|-----|--------|
| before (candidate, confirmed) | `e3e60cb5336a261199d30f33f080017160df5d4d` | feat: adjust structure of schema & examples for payloads to be unions (#252) |
| after | `0f5bd1859ef98b4b7513f415d3ec739f0819850c` | fix: add `auto_merge` property to `PullRequest` interface (#408) |
| after parent (path walk) | `c7f0d67c07feac24862b294ac219afee5fe62b1b` | tree the auto_merge commit was based on; this SHA did not itself edit the opened payload |

Candidate `e3e60cb5336a` is **not wrong**: `/pull_request/auto_merge` is absent there and present (`null`) at `0f5bd1859ef9`.

## Path walk

GitHub commits API for that path, `sha=0f5bd1859ef98b4b7513f415d3ec739f0819850c`:

1. `0f5bd1859ef98b4b7513f415d3ec739f0819850c` 2021-03-20 — add `auto_merge` (this is the fact)
2. `ad77d7a8583c40badfa525403b848aed3f4a8b43` 2021-01-20 — common label schema (#303)
3. `da605011ba87c84f0575c11f7591dce612a345e7` 2021-01-11 — prettier format
4. `e3e60cb5336a261199d30f33f080017160df5d4d` 2021-01-11 — unions restructure (assigned before)

The after-parent payload (`c7f0d67c07feac24862b294ac219afee5fe62b1b`) also lacks `/pull_request/auto_merge`; the only `pull_request` key added versus that parent is `auto_merge`. Stored as `fixtures/official/opened.parent.json`.

## Used pointers

- `/pull_request/auto_merge` — added (absent → present `null`)
- `/action` — control, unchanged (`"opened"` in before, parent, and after)

Unused fields may differ across prettier/label-schema commits between the assigned before SHA and after. The job ignores unused paths.

## Retrieval

Method: GitHub raw (`raw.githubusercontent.com`) for payload + LICENSE bytes; GitHub REST for commit, contents metadata (content omitted), license metadata, and path-commit list.

Retrieved at: `2026-09-12T06:51:00Z` (acquisition window).

No live webhook delivery. No payment.

## Stored fixture bytes / sha256

See `acquisition.json` for the machine table. Official payload blobs:

- `fixtures/official/opened.before.json` — 27482 bytes — sha256 `c7ad0961ec4c8dbe48a3322db7aa2653f232bb48f47d7c18f93d16c91f6bf800` — git blob `a4b4fbadacfa5144f0bdff65d5e3e59b662e053b`
- `fixtures/official/opened.after.json` — 27542 bytes — sha256 `7518acf79b9c347efa17e37e2c1dd3ce8dddf0c521094ec6e57648cd324ad5ce` — git blob `24579861a25974010bace8514fb980e242a470e1`
- `fixtures/official/opened.parent.json` — 27518 bytes — sha256 `08190743817a838b5327415a6087ffe4bb938950a5a2a9cc7b038e37c144009a` — git blob `62f32fa458ad6b465180420eaa6ea1084990a6a1`
- `fixtures/official/LICENSE` — 1076 bytes — sha256 `e68f8081cee4fcf84619364e6cbf0eb3b2e4100907a56d6c5912a6f090bb09ae`

Caller used-pointer lists and the OpenAPI refuse fixture (not official source):

- `fixtures/used/used.json` — 70 bytes — sha256 `0db8d0ebd6c51b0080cfd308c3d9ca754f83f029d55f485c3f0b9472c1e75e0c`
- `fixtures/used/used-control.json` — 38 bytes — sha256 `3bbd9f0b9f52984acd7654f036be2ad71eb7bf1b28650a16ab726ff9d056b282`
- `fixtures/negative/openapi.json` — 309 bytes — sha256 `0be75c7d328459de34337b5ffc568e3a40f0a54064e91545cafd94f8957a93de` (local negative; not an official pair)

## Kit

useful-jobs 1.4.0 archive sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` (2575215 bytes), extracted to `vendor/useful-jobs-1.4.0/`.

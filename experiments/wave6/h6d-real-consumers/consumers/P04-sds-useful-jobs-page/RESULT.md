# P04 SDS useful-jobs page

Status: **pass** (11 tests, 0 fail).

Official pair is local `git show` of `epistemedeus/samedaydesk` `client/src/pages/UsefulJobs.tsx` plus first-byte `USEFUL_JOBS_SHELL` title/description:

- before `abeb54eca9a71abe117898e8fe7de7e55e9d917f` (S260 useful-jobs surface)
- after `ad9bc7b448cf1f635ff1488affbe206aaf981ac0` (1.4.0 overlay)

Wrapped into held `samedaydesk.extract-batch.v0` on `title`, `description`, `headings`. Clock `2026-09-12T12:00:00.000Z`. `claims.fresh` false. `charged` false. No live fetch. `--example` refused.

## Engine vs independent witness

| | Engine (`page-change-offline-job` 0.1.1) | Witness (`witness.mjs`) |
| --- | --- | --- |
| Official pair | verdict `changed` | fact `changed` |
| title | no `/title` change | unchanged |
| description | `/description` semantic | changed |
| headings | `/headings/h1`, `/headings/h2` semantic | changed |
| Control identical | `unchanged` | `unchanged` |
| Missing clock | exit 2 `clock_required` | n/a (input refuse) |

They agree. No `regression-artifact.json`. Engine array diff reports whole `/headings/h2` replace (third h2 text changed); witness treats `headings` as one field. That is not a misclassification.

## Honesty

- html-to-extract-batch is **not equivalent**. Unselected markup, live freshness, and payment are dropped.
- First-byte title stays `Offline useful jobs for agent callers | SameDayDesk`. Description and h1/h2 move from six-job S260 copy to ten-job 1.4.0 overlay.
- Not H04 `schema-validator.html`, `resources.html`, or `/x402/verified`.
- SDS root `LICENSE` is absent at both SHAs; kit `LICENSE` is MIT (assignment hint: MIT in-tree).
- `freshness: observed` is held `completedAt` vs job clock (`maxStaleMs` 86400000), not live page freshness.

Receiving owner: **H6D-parent** catalog + `bin/select-job.mjs`.

# Reference: useful-jobs 1.4.7

Facts only. For a first run see [tutorial.md](tutorial.md). For recipes see
[how-to.md](how-to.md).

## Identity

| Key | Value |
| --- | --- |
| schema (discovery) | `samedaydesk.for-agents.useful-jobs.v1` |
| package | `useful-jobs` |
| version | `1.4.7` |
| root directory after extract | `useful-jobs-1.4.7` |
| CLI | `bin/useful-jobs.mjs` |
| Node | `>=22` |
| Network after extract | none |
| `purchaseAuthority` | `false` |
| `paidHostedClaim` | `false` |
| `schedulerDaemon` | `false` |

## Bytes

| Artifact | Path | Bytes | SHA-256 |
| --- | --- | --- | --- |
| Current public archive | `/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz` | `5255824` | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` |
| Kit mirror | `/kit/useful-jobs-1.4.7.tar.gz` | same | same |
| Discovery | `/discovery/useful-jobs.json` | n/a | n/a |
| Catalog | `/for-agents/useful-jobs/catalog.json` | n/a | n/a |
| Outcomes | `/for-agents/useful-jobs/jobs-outcomes.json` | n/a | n/a |

In-repo copies live under `client/public/` plus those paths.

Source pin on discovery: `epistemedeus/samedaydesk` commit
`27f0730604adf236e0f3ad818a30b5f43be6e656` (source, freeze, and reviewed
source are the same string on 1.4.7).

## Immutable previous archives

| Version | Bytes | SHA-256 |
| --- | --- | --- |
| 1.4.0 | `2575215` | `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` |
| 1.3.0 | `2574904` | `bc4db0ec83109852b8fdbd542d10d515c0053a30dd9b93836c9ad7c738510b6c` |
| 1.2.0 | `2579117` | `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb` |
| 1.1.0 | `2577606` | `de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534` |
| 1.0.0 | `2522418` | `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |

Versions 1.4.1 through 1.4.6 were never published as public downloads.

## Acquire tools

`bash`, `curl`, `python3`, `tar`, `mktemp`.

Environment:

| Name | Role |
| --- | --- |
| `USEFUL_JOBS_ORIGIN` | Origin prefix. Default `https://samedaydesk.com`. The follow-the-doc runner sets this to loopback. |
| `TMPDIR` | Parent for `mktemp -d`. |

Acquire stdout is the absolute kit path, one line. Diagnostics go to stderr.
`list` during acquire is on stderr on purpose.

## CLI

```
node bin/useful-jobs.mjs list
node bin/useful-jobs.mjs help [job-id]
node bin/useful-jobs.mjs run <job-id> [flags]
```

## Jobs

| id | Required flags | Outputs | `--example` |
| --- | --- | --- | --- |
| `lockfile-pin-delta` | `--before --after` | `pin-delta.json`, `pin-delta.md` | yes |
| `json-schema-webhook-drift` | `--before --after --used` | `drift-brief.json`, `drift-brief.md` | yes |
| `route-table-diff` | `--before --after --out-dir` | `route-diff.json`, `route-diff.md` | yes (`--out-dir` still required) |
| `page-change-offline-job` | `--job --out-dir` | `page-change.json`, `page-change.md` | **refused** |
| `api-upgrade-brief` | `--before --after --used` | `upgrade-brief.json`, `upgrade-brief.md` | yes |
| `vendor-budget-impact` | `--before --after` | `budget-impact.json`, `budget-impact.md` | yes |
| `feed-agenda` | `--before --after` | `agenda.json`, `agenda.ics` | yes |
| `evidence-ci-annotation` | `--input` | `annotations.json`, `annotations.md` | yes |
| `listing-repair-packet` | `--input` | `repair-packet.json`, `repair-packet.md` | yes |
| `repeat-job-record` | `--next-run` | `repeat-job.json`, `repeat-job.md` | yes |

Optional on several jobs: `--out-dir`. `route-table-diff` and
`page-change-offline-job` require it.

Release 1.4.7 newly reviewed: `lockfile-pin-delta`,
`json-schema-webhook-drift`, `route-table-diff`, `page-change-offline-job`,
`vendor-budget-impact`. The other five ids are inherited without a new
review.

## Refusal signals

| Situation | Signal |
| --- | --- |
| HTTP status not 200 on acquire | acquire non-zero; temp dir removed |
| Size != `5255824` | acquire non-zero; temp dir removed |
| SHA-256 != pin | acquire non-zero; temp dir removed |
| Missing required CLI flags | CLI non-zero; `missing-required-inputs` / `required` |
| `--example` on `page-change-offline-job` | CLI non-zero; `sample_as_delivered_watch` / `SAMPLE` |
| npm lockfile that is not v2/v3, or HTML, or yarn/pnpm/bun | lockfile job refuses |
| OpenAPI fed to `json-schema-webhook-drift` | `not-this-job-openapi` |
| Treating engine `ok: true` as a public-safe certificate | not a CLI flag; operator error. `ok` means the runner completed honestly. |

## Follow-the-doc runner

```
node docs/agent/follow-the-doc.mjs
node docs/agent/follow-the-doc.mjs --seeded-failure digest-mismatch
node docs/agent/follow-the-doc.mjs --json
```

Exit 0 only when documented happy-path commands succeed **and** every
requested seeded failure is rejected by the real acquire/CLI. The runner
does not pay, does not call the live merchant extract route, and does not
weaken TLS on the public origin (loopback HTTP is used only for the
committed archive).

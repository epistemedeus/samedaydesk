# H25 public production readback (download/list only)

Observed **2026-09-13T11:11:47Z** from actual Cursor Cloud D. One GET of live discovery; no polling. No payment, no charge-path execution, no H27 tree edits.

## Discovery

`GET https://samedaydesk.com/discovery/useful-jobs.json` → HTTP 200 (`platform: hostinger`). **Not** `deployment_pending`.

| Field | Observed |
| --- | --- |
| version | **1.4.7** |
| bytes | **5255824** |
| sha256 | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` |
| pins.sourceCommit / archiveFreeze / reviewedSource | `27f0730604adf236e0f3ad818a30b5f43be6e656` |
| purchaseAuthority | `false` |
| paidHostedClaim | `false` |
| H21 in summary/note/JSON | absent |

## Advertised coldStart (production origin)

Fresh temp `/tmp/h25-acq.Pyl0qY` (no previous kits). `USEFUL_JOBS_ORIGIN=https://samedaydesk.com`. Exit **0**. Stdout sole kit path `…/useful-jobs-1.4.7`. Acquire stderr listed all **10** advertised ids. Independent `node bin/useful-jobs.mjs list` printed the same ten ids in catalog order. No job engines were run.

## Archive identity

`GET /for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz` and `GET /kit/useful-jobs-1.4.7.tar.gz`: both **5255824** bytes, sha256 `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`, byte-identical.

## Public page

`GET https://samedaydesk.com/for-agents/useful-jobs` (and `/route-shells/for-agents__useful-jobs.html`): title Offline useful jobs; contains **1.4.7** and the archive sha; **no H21**; no `purchaseAuthority: true`; states not hosted execution / does not run hosted extract.

Acquisition scratch was removed after this receipt. H25 native session remained terminal; H27 was not used for this check.

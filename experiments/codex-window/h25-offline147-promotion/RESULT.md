# H25 PUBLIC OFFLINE 1.4.7 promotion

Native Grok CLI **1.0.25**, model **grok-4.6**, effort **xhigh**. New parent session `da4d24f2-628a-4df5-9b51-596bfc1d6313`. Auth store **LOCATION** `/home/ubuntu/.grok/auth.json`, **logged_in** true. No API-key billing.

Copied immutable approved 1.4.7 bytes onto the public download + kit paths and bound current acquire to those bytes. H21 87/0 reused; TAP packs not replayed. Cash **$0**.

## Binding

```json
{
  "packageId": "useful-jobs",
  "version": "1.4.7",
  "archive": "/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  "kitArchive": "/kit/useful-jobs-1.4.7.tar.gz",
  "sha256": "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  "bytes": 5255824,
  "sourceCommit": "27f0730604adf236e0f3ad818a30b5f43be6e656",
  "archiveFreeze": "27f0730604adf236e0f3ad818a30b5f43be6e656",
  "reviewedSource": "27f0730604adf236e0f3ad818a30b5f43be6e656",
  "rootName": "useful-jobs-1.4.7",
  "purchaseAuthority": false,
  "paidHostedClaim": false,
  "previous": {
    "version": "1.4.0",
    "archive": "/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz",
    "kitArchive": "/kit/useful-jobs-1.4.0.tar.gz",
    "sha256": "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f",
    "bytes": 2575215,
    "rootName": "useful-jobs-1.4.0"
  }
}
```

Discovery archive block:

```json
{
  "version": "1.4.7",
  "archiveUrl": "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  "archive": {
    "path": "/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
    "url": "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
    "kitPath": "/kit/useful-jobs-1.4.7.tar.gz",
    "sha256": "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
    "bytes": 5255824
  },
  "sha256": "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  "bytes": 5255824,
  "pins": {
    "sourceRepo": "epistemedeus/samedaydesk",
    "sourceCommit": "27f0730604adf236e0f3ad818a30b5f43be6e656",
    "archiveFreeze": "27f0730604adf236e0f3ad818a30b5f43be6e656",
    "reviewedSource": "27f0730604adf236e0f3ad818a30b5f43be6e656"
  },
  "purchaseAuthority": false,
  "paidHostedClaim": false
}
```

`coldStart` / `install[0]` use `bytes=5255824`, sha `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`, path `/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`, root `useful-jobs-1.4.7`.

H21 newly reviewed five: `lockfile-pin-delta`, `json-schema-webhook-drift`, `route-table-diff`, `page-change-offline-job`, `vendor-budget-impact`. The other five were inherited, not newly reviewed. Catalog notes follow the 1.4.7 archive. Published 1.0.0–1.4.0 tarballs unchanged. 1.4.1–1.4.6 are not public historical downloads.

## Tests

- H25 focused pack: **5 pass / 0 fail** (immutability, placement, binding, served-dist acquire + nonpayment).
- s260 public-integration: **27 pass / 0 fail**.
- H21 TAP packs: not replayed.

Served path: `client` `npm run build` then `vite preview` of **dist** on `127.0.0.1:4187`. Documented acquire with `USEFUL_JOBS_ORIGIN` extracted `bin/useful-jobs.mjs` and `node … list` printed all ten ids.

## Export

Branch `codex/h25-offline147-promotion-20260913`. Compare:

https://github.com/epistemedeus/samedaydesk/compare/main...codex/h25-offline147-promotion-20260913

Exact local/remote HEAD is collected at push readback (not a self-referential tracked stamp). No `gh pr create`.

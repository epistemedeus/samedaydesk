# RECEIPT — W5-M01 engine catalog

Repo: `epistemedeus/samedaydesk`
Branch: `cursor/w5-m01-select-and-wire-useful-engines-catalog-for-d01-keeping-first-offer-narrow-53b7`
Implementation: `3655d7e1a5196d32cf6a83cc650d9f9a129f6124`
Receipt head: `bd3d2aa5b91ba9c35720ea952db35349a7be2ce9`
Starting ref: `aeef964fa188443078958d9d6d393afae1d542ee` (SDS52 / PR52)
Owned path: `experiments/wave5/m01/`
Assignment branch name in TASKS.json: `codex/w5-m01-20260911` (this Cloud run used the Cursor branch above)
Draft PR: ManagePullRequest registered for operator approval (account setting blocked automatic open). Compare: https://github.com/epistemedeus/samedaydesk/compare/fable/f08-paid-wrappers...cursor/w5-m01-select-and-wire-useful-engines-catalog-for-d01-keeping-first-offer-narrow-53b7

## First offer

`lockfile-pin-delta` at pin `e81efc8ab71b1bde88eca743d297149e61bbb6f2`. Catalog promise matches invoked CLI: stdout `{ok,appId,status,counts,...}`, files `pin-delta.json` (`samedaydesk.lockfile-pin-delta.v1`) and `pin-delta.md`.

Selected but not first SKU: `json-schema-webhook-drift` `94c7bfdfeaa99f5e70f341504df3051cc7717f91`, `route-table-diff` `7387eb677abd442dfab9081cb0ad95451fd2a762`, `page-change-offline-job` `91b57334818ecd7940cb854e9864f3b1749d1d1d`.

SDS52 wrapper still lists the six useful-jobs. Live catalog and `server/paid-useful-jobs/` were not edited.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m01/test/*.test.mjs
```

Node `v22`. **24 pass, 0 fail, 0 skipped.** Includes wrapper CLI, catalog CLI, four engine CLIs, page-change stderr refusal, and loopback HTTP for route-table (separate server process).

Postgres: not used. No skipped Postgres gate.

## Current-source findings (pins above, not future M02–M05)

- Valid no-change: lockfile identical pair `status=informational`; page-change unchanged fixture `verdict=unchanged`. Not transport failure.
- Co10 false schema: `breaking/structural-change` with after `kind=literal jsonType=boolean`.
- Co10 `$ref` sibling `type` ignored (`status=informational`).
- Co10 non-integer `minimum` not fingerprinted (`informational`, 0 breaking).
- Co10 required-field at JSON Pointer `""` is breaking; `"/"` is not document root.
- Route permutation: counts all 0; `tableDigest` not equal. Digests not forced equal.
- Route stdout omits `removed`; file has it.
- Page-change refusals on this pin are stderr `{ok:false,code,message}` with no `refused` key. Changed fixture: `usefulOutputProven=true`, `complete=false`.
- Oversize page-change input: `input_bounds` refusal, not truncated success.

## Integration remaining

D01 has not imported this catalog into `runPaidOffer`. M02–M05 may amend engines; this export is valid for the listed pins only. Page-change stderr must be parsed as catalogued or D01 will mislabel refusals as missing JSON.

No live settlement, payout, homepage, or default-branch push.

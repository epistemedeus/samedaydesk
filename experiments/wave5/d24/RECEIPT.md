# W5-D24 RECEIPT — clean-environment CLI/package consumer

**Task:** W5-D24  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-d24-clean-environment-cli-package-consumer-acceptance-ffdb`  
**Tested consumer:** `b62a5213fa397f809bcf0d7d1e54c0c6b9b8b893`  
**This revision:** `caf6005ca848d3d57585986eb0a6ac61f2323980`  

**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/103 (draft)  
**Pilot packet:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Worker:** `bc-27ab28d1-a147-4820-b897-5775ed735037` · model `cursor-grok-4.6-xhigh`

## What

Thin consumer at `experiments/wave5/d24/`. Installs current D01, D07 and Co14 into an isolated prefix (not the SDS monorepo), invokes their real CLIs, and retrieves caller `vendor-budget-impact` outputs plus a D07 zip that imports as the same bytes.

Does not copy those kernels into this branch. Sibling trees are fetched read-only at test time.

## Tested pins (not future siblings)

| Input | SHA / note |
| --- | --- |
| D01 | `6bed72dd22a396134aa5c957933b42c3a5746698` (`samedaydesk.paid-useful-jobs.execution.v1`, PR 74 at that commit) |
| D07 | `5620dcda5a0cd25892914717f8680c12d887632d` (PR 77) |
| Co14 / D08 pin | `4641173163616b76608cbb3beb503f2d94369b25` (W5-D08 branch unpublished) |
| D03 (D07 adapter only) | `58cba6324c1d9793d344bc13154b8b2380e8166f` (not vendored) |
| useful-jobs archive | `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` (2522418 bytes) |

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d24/test/*.test.mjs
```

Also:

```bash
node experiments/wave5/d24/bin/clean-env.mjs accept --prefix "$prefix"
```

**PASS — 21 pass, 0 fail, 0 skip, 0 cancelled.** Node v22.14.0, Python 3.12.3. Duration 5.372s (cached prefix).

`accept --prefix` on this worker: `ok: true`. Isolation true (prefix copy, not SDS checkout). Co14 and D01 `ok: true` for caller `vendor-budget-impact`. D07 export/import `ok: true`. Retrieved: `budget-impact.json`, `budget-impact.md`, `receipt.json`, `job-artifacts.zip`. No Postgres. Missing deps were not skipped.

ensurepip is absent on this image (`python3 -m venv` cannot create pip). Install uses a copied Co14 tree plus `bin/samedaydesk-useful-jobs` wrapper. That is the documented Co14 PYTHONPATH path, not a second engine.

## Current-source findings

Reproduced on the installed CLIs:

1. D01 missing required inputs: `code=missing-required-inputs`, `transport=rejected`, not `engine-crash`.
2. D01 unknown job: `unknown-job`, delivery not complete.
3. feed-agenda identical samples: `transport=ok`, analysis `informational`, artifacts complete. Valid domain outcome, not a crash.
4. D07 `--archive-sha256` mismatch: `archive-identity-override`, exit 2.
5. D07 `--job-id vendor-budget-impact` on feed-agenda files: `job-output-mismatch`.
6. D07 import with wrong `--zip-sha256`: `zip-bytes-mismatch`.
7. Co14 same-size flipped archive: `wrong-digest`, `extracted=false`.
8. Co14 `--example --sold`: `sample-as-sale`.
9. Co14 missing Node: `missing-node`, not a payment error.
10. Co14 `list` with an empty engine catalog still returns the six packaged job ids (D08 remaining).
11. `pip3 install --target` of Co14 succeeds but the wheel omits `pins.json`, so the wheel cannot load HASH_TERMS. Consumer install copies the full package including `pins.json`.
12. D07 `termsVersion` / engine pin is not forced equal to D01 `receipt.inputsDigest`. Different schemas.

## Integration limits

- D01 still needs catalog/kit/archive at `REPO_ROOT` relatives. Mini-layout works. Not an npm package.
- D01 PR74 later head `e2f951cae7bb299df2283b9c181bb0d369fc26af` (freeze inspected bytes, receipts bind `runOutDir`) is not the recorded pin. Spot-check only: missing-required-inputs stayed `transport=rejected`; caller `vendor-budget-impact` returned `ok` with complete delivery. Full 21-test suite was not re-run on that head.
- D08 Wave5 unpublished. Remaining: include `pins.json` in the wheel, bind `list` to extracted catalog, timeout/`kill` on `spawn_node`.
- D07 completeness vs D03 `receipt.json` stays unbound unless D03 is injected.
- No live origin GET, spend, deploy, or recruited runtime. Those are D27 / Root field steps.

## pstack

Plugin cache: `9717366` `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`. Skills read in full: setup-pstack, principle-prove-it-works, principle-test-behavior-not-implementation, principle-boundary-discipline, principle-subtract-before-you-add, principle-fix-root-causes, principle-make-operations-idempotent, figure-it-out, principle-never-block-on-the-human. `~/.cursor/rules/pstack-models.mdc` absent (setup-pstack writes that only after a confirmed role map; not done here). Slash commands not invoked. No extra Cloud/Task agents.

## Stop

No default-branch push, production deploy, spend, payout, or unsolicited messages.

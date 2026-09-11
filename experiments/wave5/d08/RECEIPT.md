# W5-D08 RECEIPT — Co14 installed Python client and archive/process cleanup

**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d08-co14-installed-python-client-and-archive-process-cleanup-39c4`
**HEAD:** `e57f2d9dc0d385752b3fd274df06627d062cc0e3` (implementation; branch also has a receipt pin commit)
**PR:** https://github.com/epistemedeus/samedaydesk/pull/99 (draft)
**Starting ref:** `4641173163616b76608cbb3beb503f2d94369b25` (W4-commerce-14)
**PR52 pin (read-only, not vendored):** `aeef964fa188443078958d9d6d393afae1d542ee`
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`

## Outcome

Fresh `pip install --user` of `tools/python-useful-jobs-client` now ships `pins.json` and the `samedaydesk-useful-jobs` console script. That installed CLI extracts the verified PR51 archive and runs the real `bin/useful-jobs.mjs`. Unsafe archive members refuse before extract. Engine `ok` with missing files is `missing-output`, not complete delivery. Timed-out Node is process-group killed (Linux `PR_SET_PDEATHSIG`) and does not remain as an orphan.

Source-only Co14 predictions reproduced on `46411731` before the fix:

| Prediction | Before | After |
| --- | --- | --- |
| Python tar fallback | `TypeError` fell through to unfiltered `extractall` | `extract-filter-required`; no unfiltered call |
| Empty-input constant catalog | isolated `catalog` printed six pin ids with no archive | `missing-archive`; list with empty engine jobs is `catalog-mismatch` |
| Missing outputs | fake/real CLI `ok` with empty outDir still `ok: true` | `missing-output` (exit 2) |
| Dangling subprocess | SIGKILL of Python left hanging Node alive | `engine-timeout` kills the group; pid not alive |

Valid identical-input run still delivers both artifacts (`outcome: complete`). That is analysis output, not a crash and not missing-output.

## Tests

```bash
node --test --test-concurrency=1 tools/python-useful-jobs-client/test/*.test.mjs
```

**PASS — 19 tests, 0 fail, 0 skipped.** Python 3.12.3, Node v22.14.0, `python3 -m pip` (no `python3-venv` package on this image; `--user` with a temp `HOME` is the install used). No Postgres in this client.

pstack: plugin cache `9717366/68d834d9ca8f34c375ecb8057bfbcde5396a01f8` present; this run model `cursor-grok-4.6-xhigh`. Swarm/cloud children were not spawned.

## Integration limits

- W5-D01 owns `server/paid-useful-jobs/` at PR52 `aeef964f`. This client does not copy that wrapper. Remaining binding: D01 supplied-input contract / paid envelope. Do not treat this unpaid acquire/list/run as that wrapper.
- Live `https://samedaydesk.com` GET is still not claimed.
- Unlike I01/disclosure/settlement hashes are not forced equal to useful-jobs archive terms.

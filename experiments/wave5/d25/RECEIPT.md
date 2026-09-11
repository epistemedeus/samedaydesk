# W5-D25 RECEIPT

**Date:** 11 September 2026
**Assignment:** W5-D25
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d25-actual-buyer-journey-harness-covering-offer-supplied-input-delivery-and-return-dfbf`
**HEAD:** `322b03e798501eefb466b217ed59adf3d89d5e72` (receipt pin of harness land `dbc156dd92bc1f014effe9b167f8468902a16173`)
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/111
**Owned path:** `experiments/wave5/d25/`
**QA label:** `owner-qa` (not a customer, recruited buyer, independent demand, or settlement)

## Tested versions

| Dependency | Role | Tested |
| --- | --- | --- |
| W5-D01 / SDS PR52 | paid supplied-input CLI + `runPaidOffer` | `aeef964fa188443078958d9d6d393afae1d542ee` `server/paid-useful-jobs/` |
| W5-D09 | freeze/bind previous vs current after digest | W4 Co03 `7c55738cc5730985b709282af6c24e10f0a8442f` PR62 `tools/repeat-job-binder/` (read-only worktree) |
| W5-M01 | first offer catalog | PR52 public catalog/discovery at the same SDS52 pin. Wave5 M01 has not published a later export. |

No Wave5 D01/D09/M01 export existed at start. Consumed current pinned interfaces. Did not vendor those kernels.

## Commands / pass-fail

```bash
cd experiments/wave5/d25 && npm test
node bin/buyer-journey.mjs offer
node bin/buyer-journey.mjs journey --out-dir /tmp/w5-d25-owner-qa
```

**PASS** — `node --test test/*.test.mjs` **12/12**, 0 fail, 0 skip. Node v22.14.0.

CLI journey: two `vendor-budget-impact` jobs, both `analysis-change`, complete advertised outputs, distinct `inputsDigest`/`outputsDigest`. D09 `distinctFromFirst: true`. `sold` false. `purchaseAuthority` false.

## Current-source findings

1. Valid no-change (`engine.status=informational`) and delivered analysis refusal (`engine.status=refused` with `wrapper.ok=true`) are not transport failures. Wrapper process failure and missing advertised files stay distinct.
2. Non-object JSON `--before` is not wrapper-malformed (text does not start with `{`/`[`); the engine still writes a refused artifact. Harness classifies that as `analysis-refusal`.
3. Reused `--out-dir` keeps foreign files. Wrapper output lists only the current job's advertised names. Harness delivery requires those names on disk.
4. D01 caller next-run notes containing the substring `SAMPLE` (`Not a SAMPLE kit fixture`) are sample-labelled by D09. `--live-recurrence` refuses. Owner-QA fixtures avoid that substring.
5. D01 receipts have no `termsVersion`. D09 second-run uses I01 `sha256:`+64hex. Those hashes are not forced equal.
6. Kit acquisition in `wrapper.mjs` still runs before the try block. Missing-archive crash was not process-reproduced here (committed archive present). Remaining D01 binding.

## Integration limits

- D09 still executes PR51 useful-jobs CLI itself. Paid return delivery is D01 CLI, not binder `engine/` artifacts.
- No hosted paid HTTP route (D14), no Postgres claim, no live settlement, no deploy, no field customers.
- Rebase when W5-D01/M01/D09 publish later contracts.

## pstack

Read from cache `~/.cursor/plugins/cache/cursor-public/9717366/68d834d9ca8f34c375ecb8057bfbcde5396a01f8/skills/`: `setup-pstack`, `principle-prove-it-works`, `tdd`, `principle-test-behavior-not-implementation`, `blast-radius`. Did not invoke `/swarm` or `/poteto-mode` (no extra Cloud agents). Parent model: included Cursor Grok 4.6 xhigh.

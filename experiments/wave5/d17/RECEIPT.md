# W5-D17 RECEIPT

**Slot:** W5-D17
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d17-domain-outcome-contract-tests-for-successful-change-no-change-refusal-reports-5d04`
**Head:** see git after this commit
**Tested implementation:** SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` (`fable/f08-paid-wrappers`, wrapper `server/paid-useful-jobs/bin/cli.mjs`)
**Engine archive:** useful-jobs 1.0.0 sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` (2522418 bytes)
**Owned paths:** `experiments/wave5/d17/`
**Model:** Cursor Grok 4.6 xhigh (run `bc-b5089168-89b2-4bde-9493-07b8c06cbaff`)
**pstack:** read `tdd`, `principle-test-behavior-not-implementation`, `principle-prove-it-works`, `principle-boundary-discipline`, `setup-pstack` from plugin cache `9717366/...`. No slash dispatch. Did not write `pstack-models.mdc`.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d17/test/*.test.mjs
```

**PASS** — 14 pass, 0 fail, 0 skipped (Node v22.14.0). Real wrapper CLI/process, not mocks. Postgres unused (no store in this claim); not a skipped gate.

| Case | `outcome` |
| --- | --- |
| pricing field change | `analysis_change` |
| identical pricing / note-only / unused OpenAPI path | `analysis_no_change` |
| HTML pricing + evidence `decision=fail` | `analysis_refusal` (wrapper `ok: true`, artifacts present) |
| unsupported evidence schema / digest mismatch | `engine_failure` (no artifacts) |
| unknown job / missing inputs | `wrapper_refusal` |
| reused `--out-dir` after deleting one catalog file | `incomplete_delivery` |
| `--out-dir` is a file / archive `EACCES` before try | `transport_failure` |

Note-only and identical pairs are both `analysis_no_change` with **different** engine digests. Unlike terms/digests were not forced equal.

## Current-source findings (SDS52)

- Six engines emit `{ ok: true, status }` and write artifacts for change, no-change, and delivered refusal. Wrapper `ok` is true for all three. Treating `status: refused` as a product failure is **disproved** at this pin.
- `receipt.engineResult.refused` stays false when `engine.status` is `refused`. Classify from `engine.status`.
- `ensureUsefulJobsKit()` runs before the wrapper `try`. Archive `EACCES` is an uncaught crash, not a JSON refusal.
- CLI `mkdirSync` of `--out-dir` after `runPaidOffer` crashes when the path is a file (exit 1, no JSON).
- Output list is `existsSync` on the caller `outDir`. Engine sibling-dir on pre-existing outputs can leave a partial/stale set with `ok: true`.
- Digest mismatch / unsupported schema: engine `ok: false`, no refusal artifact. Distinct from delivered `status: refused`.

## Remaining integration binding

- **W5-D01:** stamp `domainOutcome` from `samedaydesk.wave5.d17.domain-outcome.v1`; do not use `wrapper.ok` as the analysis layer; catch kit acquisition; bind delivery to the directory the engine actually wrote.
- **W5-M01:** keep envelope `status` in `actionable|informational|partial|refused` or publish an explicit map. D17 tested the current six-job catalog only. No future sibling behavior claimed.

No default-branch push, deploy, spend, or outbound messages.

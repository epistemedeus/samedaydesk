# W5-M14 RECEIPT

**Task:** W5-M14  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-m14-human-readable-result-preview-and-concise-machine-first-quickstart-f75c`  
**HEAD:** `b28e21b0ca5b4f1b3a7cc36ebbd7bb3aef02acbb`  
**StartingRef / tested wrapper:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/106  
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Owned path:** `experiments/wave5/m14/`  
**Node:** v22.14.0

## What

Usable kit for an unbriefed reader and a machine caller:

- `quickstart` JSON (default) lists live catalog jobs, required flags, wrapper CLI, and limits.
- `choose --files` sniffs local files and names one advertised input set.
- `preview` runs SDS52 `bin/cli.mjs`, then prints transport / analysis / delivery / payment plus a real artifact excerpt.

Not a second runner. Engines stay in the PR51 archive the wrapper already extracts.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m14/test/*.test.mjs
```

**PASS** — 29 pass, 0 fail, 0 skipped, 0 cancelled.  
Suites: choose 10, classify 5, limits 2, preview-process 9, quickstart 3.  
Process tests spawn `bin/preview.mjs` and SDS52 `cli.mjs`. Postgres unused. Missing engines were not skipped.

## Current-source findings (SDS52 `aeef964`)

1. Engine `status: refused` with `ok: true` and both expected files is wrapper success. HTML-as-pricing is a valid analysis refusal, not a crash. Preview layer `useful-delivery`.
2. Identical before/after pricing JSON is `status: informational` with `fieldChanges=0`. Preview does not label it transport or engine failure.
3. `engine.digest`, `receipt.inputsDigest`, `receipt.outputsDigest`, and output `sha256` are unlike. The kit records them separately and does not force equality.
4. Wrapper codes `missing-required-inputs` and `unknown-job` remain analysis `not-run`. SAMPLE `--example` is `sample=true`, `sold=false`.
5. D01 `samedaydesk.paid-useful-jobs.execution.v1` at `6bed72dd22a396134aa5c957933b42c3a5746698` was read read-only. This checkout still executes SDS52. Kernel `transport`/`analysis`/`delivery` fields are used only when present on a result.

## Remaining integration binding

- **D01:** later executor contract (isolated staging, acquisition-in-try, kernel layer fields). Not claimed here.
- **M01:** catalog/engine selection still PR51 six jobs via PR52 `JOBS`.
- **D24:** clean-environment install without this checkout. This kit needs the repo tree.

No live settlement, catalog publication, production deploy, spend, payout, or unsolicited messages.

## pstack

Plugin cache includes `setup-pstack/SKILL.md`. `~/.cursor/rules/pstack-models.mdc` is absent. Skills were read as files (`technical-writing`, `principle-prove-it-works`, `principle-test-behavior-not-implementation`, `principle-experience-first`, `unslop`). No slash invocation. No extra Cloud/Task agents. Parent model: Cursor Grok 4.6 xhigh (`cursor-grok-4.6-xhigh`).

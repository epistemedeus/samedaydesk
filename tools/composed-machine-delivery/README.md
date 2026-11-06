# Composed machine delivery

One cold-acquirable path across the existing task-repeat, recurring-decision, workflow-owned, and two-sided consumers.

An agent can retain one permitted capture, derive several decisions from it, select a fitting existing workflow extension, and, when a useful change asks for it, prepare bounded requester, work, delivery, and substantive acceptance. The original task, terms, rights, fee, and readback sources stay in those packages. This directory does not replace their commands.

Sharing is optional. Public output hides reward amounts. Human publication is reserved and is not performed.

## Acquire

From a fresh extraction of `tools/composed-machine-delivery/dist/composed-machine-delivery.tar.gz`:

```bash
tar -xzf composed-machine-delivery.tar.gz -C <empty-dir>
cd <empty-dir>
node tools/composed-machine-delivery/cli.mjs deliver \
  --request tools/composed-machine-delivery/examples/changed-request.json \
  --store <dir> \
  --out <public.json>
```

The example input is a synthetic owned-test page whose heading changed. The public JSON is the retained useful output. The store keeps the private receipt, including the fee projection, for the caller who supplied the original terms.

Build the archive from a full checkout:

```bash
node tools/composed-machine-delivery/cli.mjs pack \
  --out tools/composed-machine-delivery/dist/composed-machine-delivery.tar.gz
```

## Commands

```bash
node tools/composed-machine-delivery/cli.mjs deliver --request <request.json> --store <dir> [--out <public.json>]
node tools/composed-machine-delivery/cli.mjs retain --capture <capture.json> --store <dir> --clock <ISO-UTC> [--replace]
node tools/composed-machine-delivery/cli.mjs recover --store <dir> [--previous]
node tools/composed-machine-delivery/cli.mjs show --store <dir>
```

`deliver` keeps one capture. The same capture digest does not write a second copy. A different delivery in the same store is refused. A lost current capture restores the recovery copy. Explicit replace keeps the previous capture.

Work is prepared only when a decision is a useful change, the caller supplies work, and the original terms stay `feeBps` 500 on `new_job_gross`. The delivery heading must be the retained capture title. Acceptance uses the existing task-bundle diagnose outcome. The fee readout is compared with `vendor/hosted-wallet-market/src/fee.mjs`. This path does not invent a price, pay, sign, or settle.

## Direct commands

These remain the honest path when the composed request does not fit.

```bash
node tools/task-repeat-use/cli.mjs walk --case fitting
node tools/task-repeat-use/cli.mjs walk --case nonfitting-capture
node tools/recurring-decision-consumer/cli.mjs recur --capture <capture.json> --intents <intents.json> --priors <priors.json> --schedule <schedule.json> --clock <ISO-UTC> --horizon <hours>
node tools/result-reuse/cli.mjs preview --input <result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC>
node tools/workflow-owned-extensions/cli.mjs acquire --consumer native --site samedaydesk --store <dir> --source c60641e8ff2b94dd704307e57f5b6fe789ba0df7 --clock <ISO-UTC>
node tools/two-sided-work-consumer/cli.mjs post --journey <file> --input <post.json> --clock <ISO-UTC>
```

A permitted field snapshot is not a walletless verification result. Repeat use stays on `task-repeat-use`. Observation-only callers stay on `result-reuse`. Named workflow needs are `local-process`, `mcp-tool`, and `unpublished-review`, and only when the caller also names a site and supplies a fitting input that agrees with the retained capture. `ghost`, `dify`, `n8n`, and `dify-table-csv` stay unsupported.

## Checks

```bash
node --test --test-concurrency=1 tools/composed-machine-delivery/test/*.test.mjs
```

# Composed machine delivery receiving

Private record for the integration writer. This file is excluded from the customer archive.

## Identity

- Admission host: h10
- Hostname: cursor
- Boot id: 8356954c-bf56-4fe8-a256-d104c1c7c2ea
- Gate shell pid: 16097
- Session: d5661425-9fd0-41e8-9503-3a1fea34a944
- Amend run: ae14-nov06-sds-compose-amend1-20261106T143908Z
- Catalog model declared by admission: grok-4.7
- Effort: xhigh
- Commit identity: pilot-heavy-worker / heavy@pilot.invalid
- GitHub login used by gh: epistemedeus
- Integration owner declared by the continuation: Lead ade90474-1dc2-4ca8-b524-21eaeb1a1fbc
- Writer: codex/n7-sds-composed-delivery-20261106
- Worktree: /home/ubuntu/ae14-work/nov06-sds-compose
- Qualified base: c60641e8ff2b94dd704307e57f5b6fe789ba0df7
- Composition parents: c60641e8ff2b94dd704307e57f5b6fe789ba0df7, 7a606b73cdc036947281182142c61f5c77fa6db8, afab23058970e88d49cbf5988fb39ef81230c0db, d413cc95d29056db80da478291d0a765a34c0556, 21fadd907c0b100905c882c9c5734e601a225c7a
- Code commit before this record: ffc1c264456200cb775f0ee528332cfc732a1f85
- PR base read back: codex/h136010-machine-release-20261103 at c60641e8ff2b94dd704307e57f5b6fe789ba0df7

## What was composed

One retained permitted capture feeds the existing recurring decision consumer. A fitting page-change input can select the existing native workflow extension. When a decision is a useful change and the caller supplies unchanged 500 bps `new_job_gross` terms, the existing two-sided consumer posts, claims, delivers, and accepts. Walletless repeat use stays on its own command. The representative capture is a field snapshot, so the composed receipt does not pretend it is a verification result.

Public stdout and `examples/retained-output.json` omit `2000000`, `100000`, `1900000`, `earnedDebtAtomic`, and `feeBps`. The caller store keeps the private quote: platform fee `100000`, contributor net `1900000`, `thisQuoteFeeIsExactFivePercent` true, earned debt `21`.

## Advisory hypotheses

- 380 actor labels. The walk result already sets `independentReuse` from the portable import verdict, not from the party strings. `admitActors` had an unused label flag named `independentReuse`. That flag was removed. Control `label-not-reuse` keeps `independentReuse` false when the caller still uses the later-agent labels and permission is absent.
- 381 MCP framing. Both the caller and `runtime/mcp-stdio.mjs` use Content-Length frames, which is the MCP stdio framing this consumer implements. Newline-delimited JSON is not accepted as a successful call. Non-empty unframed stdin now returns a parse error and exits non-zero.
- 382 proof replay. Confirmed. A stored proof replayed for a different subject or sequence. Replay now requires the same subject and sequence and leaves the stored proof in place on conflict.
- The merge-ok note was not treated as a test result. The octopus merge was already present and was kept.

## Commands and exits

Clean tree `ffc1c264456200cb775f0ee528332cfc732a1f85`, serial, 2026-11-06:

```text
node --test --test-concurrency=1 tools/task-repeat-use/test/*.test.mjs
EXIT 0, tests 13, pass 13, fail 0

node --test --test-concurrency=1 tools/workflow-owned-extensions/test/*.test.mjs
EXIT 0, tests 32, pass 32, fail 0

node --test --test-concurrency=1 tools/two-sided-work-consumer/test/*.test.mjs
EXIT 0, tests 17, pass 17, fail 0

node --test --test-concurrency=1 tools/recurring-decision-consumer/test/*.test.mjs
EXIT 0, tests 63, pass 63, fail 0

node --test --test-concurrency=1 tools/composed-machine-delivery/test/*.test.mjs
EXIT 0, tests 12, pass 12, fail 0
```

The composed file includes the cold extraction. From an empty directory the archive ran `deliver`, `show`, `recur`, `result-reuse preview`, `task-repeat-use walk --case fitting`, and `walk --case nonfitting-capture`. Fitting reuse was true. The non-fitting capture stayed false and named competent direct execution.

Before the code commit, task-repeat exited 1 and workflow exited 1 because `package.json` differed from HEAD. Those guards compare the worktree with HEAD. The same commands exited 0 after `ffc1c264`. Two-sided and recurring had already exited 0 on that source.

Human assets:

```text
git diff --exit-code c60641e8ff2b94dd704307e57f5b6fe789ba0df7 -- client/dist client/public client/src vendor/hosted-wallet-market/src/fee.mjs
EXIT 0
```

`git hash-object client/dist/index.html` matched `git rev-parse c60641e8ff2b94dd704307e57f5b6fe789ba0df7:client/dist/index.html`. Tracked emitted files were compared, not only templates.

## Artifact

- Archive: `tools/composed-machine-delivery/dist/composed-machine-delivery.tar.gz` (361926 bytes, 418 members)
- Input: `tools/composed-machine-delivery/examples/changed-request.json`
- Output: `tools/composed-machine-delivery/examples/retained-output.json`
- Command: `node tools/composed-machine-delivery/cli.mjs deliver --request tools/composed-machine-delivery/examples/changed-request.json --store <dir> --out <public.json>`

The archive omits this receiving directory, the dist directory, and the package operator notes `TERMINAL.md`, `N7-RECEIVING.md`, and `whole-effort-receipt.json`.

## Limits

Root keeps release, public acquisition, and money authority. This writer does not merge to the default branch, publish human copy, install a host, create an account, or move a payment. Original jobs and earned obligations are unchanged. Ghost, Dify, and n8n installers stay unsupported. The composed command does not run walletless repeat use on the representative field snapshot.

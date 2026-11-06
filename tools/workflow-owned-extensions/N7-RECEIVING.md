# N7 workflow distribution receiving

Source receipt for three consumers added on top of the c606 package. This file
does not install Ghost, Dify, or n8n, and it does not publish a human preview.

## RESULT

- Product `epistemedeus/samedaydesk`. Writer `codex/n7-workflow-distribution-20261106`.
- Base `c60641e8ff2b94dd704307e57f5b6fe789ba0df7` on `codex/h136010-machine-release-20261103`.
- Scope `tools/workflow-owned-extensions/` only. Ghost installer was not reopened. E07 `87f2f0e548e842bbecd6b0cff84e1ac71ed782e9` was not rerun.
- Consumers: `native` (local package process), `mcp` (MCP stdio / CLI tools), `review` (unpublished Dify/Ghost-class draft).
- Sites a caller must name: `samedaydesk`, `ein-llc`, `neomorphic-io`. No consumer is selected for the caller.
- Prepared: committed manifests stay `source_only_not_installed` and `not yet executed on runtime`.
- Installed: no host runtime. Ghost, Dify, and n8n were not installed. No site was deployed. No human preview was published.
- Exercised: owner QA started each local process, compared the observation with the result-reuse CLI, then removed the prefix. A JSON register without `prefix/SOURCE.json` is not an installation. That case falls through to the CLI with `unsupported_execution`.

## Comparison with the direct CLI

One owner-QA sample on this host, not a pass threshold:

- Direct `tools/result-reuse/cli.mjs preview`: exit 0, 47 ms, observation equal to `previewReuse`.
- Native process: 54 ms, `native_package_executed`, observation equal, `published: false`.
- MCP stdio process: 47 ms, `mcp_stdio_executed`, observation equal, `published: false`.
- Review-draft process: 50 ms, `review_draft_executed`, observation equal, `published: false`.

The retained useful result is the same observation. The direct CLI is the shorter path when a machine only needs that observation. The added adaptation is the pinned acquire, update, and remove prefix, the MCP tool process, and an unpublished review file. Those are useful when a caller needs that surface. They do not improve the observation itself.

Package unit command:

```bash
node --test --test-concurrency=1 tools/workflow-owned-extensions/test/*.test.mjs
```

Result: 29 pass, 0 fail, exit 0. The seven new cases cover fitting and non-fitting input, retained observation equality, version and source pin continuity, update, remove, process evidence, publication refusal, and the explicit unsupported declaration for Ghost, Dify, n8n, and a missing prefix.

## EXITS

- `unit_tests 0`
- `effort_sample 0`

## Host

- Hostname `cursor`. Admission host label `h2`.
- Boot `8902040d-1167-48bb-8336-486bbb7d4f6b`.
- Owner QA shell pid `8830`. Node `v22.23.4`.
- Session `d14ca892-33d2-4c26-a670-7fa902420b00`.
- Catalog model `grok-4.7`, effort `xhigh`, account `epistemedeus`.

## Outside use and payment

None. Owner QA only. No customer, no publication, no charge.

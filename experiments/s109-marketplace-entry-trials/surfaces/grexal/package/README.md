# Source-change evidence packager

Offline Git diff capture and bounded structural analysis. Node.js 18+ and Git are required for repository capture; no npm dependency or model is used. Structural checks are not git-apply verification, complete source provenance, useful work, buyer acceptance, escrow approval or provider paid execution.

From the package directory:

```sh
npm test
node bin/validate-manifest.mjs
node agent/pack_evidence.js --unifiedDiffFile fixtures/diff/simple.patch --buyerCriteriaFile fixtures/criteria/require-structural.json --stdout-only
node agent/pack_evidence.js --unifiedDiffFile fixtures/diff/simple.patch --outDir /tmp/source-evidence-first
node bin/fee-worksheet.mjs --micros 50000 66667 80000 100000
```

Output directories must be fresh. To capture a real checkout, use `node agent/pack_evidence.js --repoPath /path/to/repo --baseRef HEAD~1 --headRef HEAD --rangeOp '..' --stdout-only`. Two dots compare endpoint trees; three dots (the default) compare merge-base(base,head) to head. Supplied diffs only carry ref labels; they do not prove those revisions. Git is invoked without external diff or textconv helpers, with a 30-second timeout and bounded stdout. Binary patches are flagged but their payloads are not verified. Combined diffs are unsupported. No completeness detector can recover omitted files or comments from a supplied patch.

Diff limit is 5 MiB, configurable downward only. Oversized supplied text is omitted from evidence JSON and marked; a file exceeding the hard read bound fails. An omitted file is named changes.OMITTED.txt, never changes.diff. Empty, malformed, truncated or unsafe-path patches fail structural checks. Criteria are local calculations only. Literal paths are decoded conservatively; non-UTF-8 names are unsupported. No archive extraction or patch application occurs.

## First private provider draft (operator action)

Validate against the pinned official CLI without authentication:

```sh
npx --yes grexal@0.4.1 validate
```

After reviewing source, extract the npm archive into a fresh directory and enter `package`. It contains a name-only `.grexal/agent.json` for `samedaydesk-source-change-evidence`, no agent ID or credentials. Another creator should choose their own unused slug. Initialize a dedicated local Git index before push: CLI 0.4.1 uses `git ls-files | tar`, whose pipeline can otherwise succeed with an empty archive outside Git. Do not run these preparation commands in the parent repository. Then use the already approved account to upload/build a draft:

```sh
git init .
git add agent lib bin test fixtures package.json grexal.json README.md LICENSE worksheets .grexal/agent.json
npx --yes grexal@0.4.1 push
```

This is the CLI's draft deployment command, not publication. It was not executed in this review. Do not append `--publish`. A live private agent is a separate operator choice: verify/set `npx --yes grexal@0.4.1 agent set-visibility private` before any `publish` action. Draft build, SDK sandbox execution and visibility need provider readback; local tests alone do not demonstrate deployment. Only the name stub is shipped; never add a returned provider agentId or credentials to a redistributable package.

Runtime manifest uses Grexal v3 typed input/output fields and the ctx.task/log/progress entry contract. The archive includes the original tests and all needed fixtures; run `npm pack --ignore-scripts`, extract into a fresh directory, enter package, then run the commands above. No unshipped fixture path is required.

The offline fee worksheet records the published 2026-09-10 formula: min(max(20% of charge, $0.02), 30% of charge). One USD is 1,000,000 micros. Exact rational micro values are included; four-decimal USD values are display-only, not provider rounding. There is no chosen sale price or earnings claim. Pricing, publishing, paid invocation and upstream paid services are separate unexecuted boundaries. See https://docs.grexal.ai/docs/payments and https://docs.grexal.ai/docs/agent-manifest.

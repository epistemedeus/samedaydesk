#!/usr/bin/env node
// Frozen unpublished 1.4.4. Refuses to overwrite ff493409…. Parameterized overlay packer.
import { packUsefulJobsOverlay } from "./build-useful-jobs-overlay.mjs";

packUsefulJobsOverlay({
  version: "1.4.4",
  prevVersion: "1.4.3",
  prevSha: "a18ab918b5a6f60a6981903694aeba41d7d30dd8ad3e336f1d7b8fd22cf62b09",
  prevBytes: 2615491,
  immutableVersions: ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.4.1", "1.4.2", "1.4.3"],
  refuseWrapperInPrev: true,
  freezeExistingSha: "ff4934096e2ba2c95f52c9e364647b455009c36710723f754f3f63ea0dcb5aac",
  rewriteReadmeVersions: true,
  notes: {
    readme: [
      "",
      "## 1.4.4 SDS wrapper overlay",
      "",
      "This archive keeps the 1.4.3 kit CLI, engines, and `lib/common.mjs` vendor scratch lifecycle.",
      "It also ships the in-tree SDS execution.v1 wrapper and managed-order interrupt path at their",
      "repo-relative locations (`server/paid-useful-jobs/lib/wrapper.mjs`, `tools/managed-useful-jobs-order/lib/create-order.mjs`).",
      "Those files include publication rollback (`rollback-incomplete`) and `interrupted-incomplete`.",
      "Vendor-budget-impact identity still extracts nested useful-jobs 1.0.0 (`6bf65039…`, 2522418 bytes).",
      "Do not re-nest useful-jobs-1.4.3.tar.gz. Version 1.4.3 remains byte-identical at",
      "`/for-agents/useful-jobs/useful-jobs-1.4.3.tar.gz` (2615491 bytes, sha256 `a18ab918…`).",
      "Extracted Postgres `import 'pg'` is a host driver; this package does not vendor `node_modules`.",
      "No live fetch or purchase authority.",
      "",
    ].join("\n"),
    notice:
      "\n1.4.4 SDS wrapper/interrupt overlay. 1.4.3 archive a18ab918 remains unchanged and does not contain wrapper.mjs. Nested 1.0.0 is identity extract only. No live fetch or purchase authority.\n",
    allowlist:
      "\n1.4.4 overlay: SDS execution.v1 wrapper, managed-order interrupt, m01 adapter, job-input-preflight/atomicity/mailbox import graph, nested useful-jobs-1.0.0 identity archive. Do not re-nest 1.3. Prior archives remain unchanged.\n",
  },
});

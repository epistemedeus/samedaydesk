#!/usr/bin/env node
// Immutable 1.4.4 + 1.4.3 bases plus packaged engines/<id> resolution and declared pg.
// Does not rewrite useful-jobs-1.4.4.tar.gz (ff493409…) or 1.4.3 (a18ab918…).
import { packUsefulJobsOverlay } from "./build-useful-jobs-overlay.mjs";

packUsefulJobsOverlay({
  version: "1.4.5",
  prevVersion: "1.4.4",
  prevSha: "ff4934096e2ba2c95f52c9e364647b455009c36710723f754f3f63ea0dcb5aac",
  prevBytes: 5252886,
  immutableVersions: ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.4.1", "1.4.2", "1.4.3", "1.4.4"],
  refuseWrapperInPrev: false,
  rewriteReadmeVersions: false,
  notes: {
    readme: [
      "",
      "## 1.4.5 packaged engine layout and Postgres driver declaration",
      "",
      "Selected M01 engines advertised by SDS execution.v1 resolve from packaged `engines/<id>`",
      "using the same `cli.relativeBin` as in-tree `tools/<id>`. That is general layout resolution,",
      "not a per-job alias. Git fetch is not a packaged-runtime acquisition path.",
      "Optional Postgres store: from the extract run",
      "`cd tools/managed-useful-jobs-order && npm install --omit=dev --no-fund --no-audit`",
      "to install declared `pg` 8.23.0 for host postgresql-16. The archive does not contain `node_modules`.",
      "Versions 1.4.4 (`ff493409…`) and 1.4.3 (`a18ab918…`) remain byte-identical.",
      "No live fetch or purchase authority.",
      "",
    ].join("\n"),
    notice:
      "\n1.4.5 packaged engines/<id> resolution and declared pg 8.23.0 cold install. 1.4.4 ff493409 and 1.4.3 a18ab918 remain unchanged. No node_modules in the archive. No live fetch or purchase authority.\n",
    allowlist:
      "\n1.4.5 overlay: m01 engine-root packaged engines/<id> lookup; managed-order package.json + package-lock.json declaring pg 8.23.0; lib/pg-cluster.mjs. Do not vendor node_modules. Do not rewrite 1.4.4 or 1.4.3.\n",
  },
});

#!/usr/bin/env node
import { ensureProductRoot } from "../lib/product.mjs";
import { stageLock, stagePage, stageRoute, stageSchema } from "../lib/fixtures.mjs";
import { runAfterPrepare, runControl } from "../lib/run.mjs";
import { outcomeOf } from "../lib/invoke.mjs";
import { sha256File } from "../lib/sha.mjs";

const root = ensureProductRoot();
const caseId = process.argv[2] || "help";

function print(label, spawned, extra = {}) {
  const body = spawned.body;
  process.stdout.write(
    `${JSON.stringify(
      {
        caseId: label,
        ok: body?.ok ?? null,
        status: spawned.status,
        stage: body?.stage || null,
        outcome: outcomeOf(body),
        orderCode: body?.order?.code || null,
        runOutDir: body?.runOutDir || null,
        argv: spawned.argv,
        ...extra,
      },
      null,
      2,
    )}\n`,
  );
}

if (caseId === "help") {
  process.stdout.write(`d15-final-freeze cases:
  lock-changed | lock-same | lock-overwrite | lock-symlink
  schema-changed | schema-same | schema-partial | schema-overwrite
  route-changed | route-overwrite
  page-changed | page-same | page-capture-overwrite | page-capture-symlink | page-job-overwrite
  http | second-after
`);
  process.exit(0);
}

if (caseId === "lock-changed") {
  const fx = stageLock(root);
  print(caseId, runControl(root, "lockfile-pin-delta", fx));
} else if (caseId === "lock-same") {
  const fx = stageLock(root, { same: true });
  print(caseId, runControl(root, "lockfile-pin-delta", fx));
} else if (caseId === "lock-overwrite") {
  const fx = stageLock(root);
  const spawned = runAfterPrepare({
    root,
    jobId: "lockfile-pin-delta",
    inputs: fx,
    ops: [{ kind: "overwrite", target: fx.after, overlay: fx.overlay }],
  });
  print(caseId, spawned, { liveAfter: sha256File(fx.after), inspectAfter: fx.inspectAfter });
} else if (caseId === "lock-symlink") {
  const fx = stageLock(root);
  const spawned = runAfterPrepare({
    root,
    jobId: "lockfile-pin-delta",
    inputs: fx,
    ops: [{ kind: "symlink", target: fx.after, overlay: fx.overlay }],
  });
  print(caseId, spawned, { liveAfter: sha256File(fx.after), inspectAfter: fx.inspectAfter });
} else if (caseId === "schema-changed") {
  const fx = stageSchema(root, "changed");
  print(caseId, runControl(root, "json-schema-webhook-drift", fx));
} else if (caseId === "schema-same") {
  const fx = stageSchema(root, "same");
  print(caseId, runControl(root, "json-schema-webhook-drift", fx));
} else if (caseId === "schema-partial") {
  const fx = stageSchema(root, "partial");
  print(caseId, runControl(root, "json-schema-webhook-drift", fx));
} else if (caseId === "schema-overwrite") {
  const fx = stageSchema(root, "changed");
  const spawned = runAfterPrepare({
    root,
    jobId: "json-schema-webhook-drift",
    inputs: fx,
    ops: [{ kind: "overwrite", target: fx.after, overlay: fx.overlay }],
  });
  print(caseId, spawned, { liveAfter: sha256File(fx.after), inspectAfter: fx.inspectAfter });
} else if (caseId === "route-changed") {
  const fx = stageRoute(root);
  print(caseId, runControl(root, "route-table-diff", fx));
} else if (caseId === "route-overwrite") {
  const fx = stageRoute(root);
  const spawned = runAfterPrepare({
    root,
    jobId: "route-table-diff",
    inputs: fx,
    ops: [{ kind: "overwrite", target: fx.after, overlay: fx.overlay }],
  });
  print(caseId, spawned, { liveAfter: sha256File(fx.after), inspectAfter: fx.inspectAfter });
} else if (caseId === "page-changed") {
  const fx = stagePage(root);
  print(caseId, runControl(root, "page-change-offline-job", fx));
} else if (caseId === "page-same") {
  const fx = stagePage(root, { same: true });
  print(caseId, runControl(root, "page-change-offline-job", fx));
} else if (caseId === "page-capture-overwrite") {
  const fx = stagePage(root);
  const spawned = runAfterPrepare({
    root,
    jobId: "page-change-offline-job",
    inputs: fx,
    ops: [{ kind: "overwrite", target: fx.after, overlay: fx.overlay }],
  });
  print(caseId, spawned, { liveAfter: sha256File(fx.after), inspectAfter: fx.inspectAfter });
} else if (caseId === "page-capture-symlink") {
  const fx = stagePage(root);
  const spawned = runAfterPrepare({
    root,
    jobId: "page-change-offline-job",
    inputs: fx,
    ops: [{ kind: "symlink", target: fx.after, overlay: fx.overlay }],
  });
  print(caseId, spawned, { liveAfter: sha256File(fx.after), inspectAfter: fx.inspectAfter });
} else if (caseId === "page-job-overwrite") {
  const fx = stagePage(root);
  const spawned = runAfterPrepare({
    root,
    jobId: "page-change-offline-job",
    inputs: fx,
    ops: [{ kind: "overwrite", target: fx.job, overlay: fx.mutatedJob }],
  });
  print(caseId, spawned, { liveJob: sha256File(fx.job), inspectJob: fx.inspectJob });
} else if (caseId === "http") {
  const fx = stageLock(root);
  print(caseId, runControl(root, "lockfile-pin-delta", fx, ["--http"]));
} else if (caseId === "second-after") {
  const changed = stageLock(root);
  const same = stageLock(root, { same: true });
  print(
    caseId,
    runControl(root, "lockfile-pin-delta", { ...changed, dir: changed.dir }, ["--second-after", same.after]),
  );
} else {
  process.stderr.write(`unknown case ${caseId}\n`);
  process.exit(2);
}

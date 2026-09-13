#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASE_IDS, runCase } from "../src/cases.mjs";
import { LIFECYCLE_KINDS, PINNED_IMPLEMENTATION, SCHEMA } from "../src/contract.mjs";
import { killIsolateProcesses, killPidFile } from "../src/kit.mjs";

const hostTmp = tmpdir();
const isolate = mkdtempSync(join(hostTmp, "w5-d16-"));
process.env.TMPDIR = isolate;
process.env.D16_PIDFILE = join(isolate, "hang.pid");

const argv = process.argv.slice(2);
const cmd = argv[0] || "test";

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function fail(code, message, extra = {}) {
  print({ ok: false, schema: SCHEMA, code, error: message, ...extra });
  rmSync(isolate, { recursive: true, force: true });
  process.exit(2);
}

try {
  if (cmd === "list") {
    print({ ok: true, schema: SCHEMA, pinnedImplementation: PINNED_IMPLEMENTATION, cases: CASE_IDS });
  } else if (cmd === "positive" || cmd === "case") {
    const id = cmd === "positive" ? "positive" : argv[1];
    if (!id) fail("missing-case", "case requires an id");
    const result = await runCase(id, { isolate, pidFile: process.env.D16_PIDFILE });
    print(result);
    if (id === "positive" && result.classification?.accepted !== true) {
      rmSync(isolate, { recursive: true, force: true });
      process.exit(2);
    }
  } else if (cmd === "test" || cmd === "run") {
    const ids = argv[1] ? [argv[1]] : CASE_IDS;
    const results = [];
    for (const id of ids) {
      results.push(await runCase(id, { isolate, pidFile: process.env.D16_PIDFILE }));
    }
    const positive = results.find((r) => r.caseId === "positive");
    const hiddenAccepted = results.filter(
      (r) => r.classification?.accepted === true && r.classification?.kind !== LIFECYCLE_KINDS.ENGINE_RAN,
    );
    const brokenAccepted = results.filter((r) => {
      if (r.caseId === "positive" || r.caseId === "delete-cli-reextract" || r.caseId === "domain-refused") {
        return false;
      }
      return r.classification?.accepted === true;
    });
    const ok =
      positive?.classification?.accepted === true &&
      hiddenAccepted.length === 0 &&
      brokenAccepted.length === 0 &&
      results.every((r) => r.wrapper?.sold !== true);
    print({
      ok,
      schema: SCHEMA,
      pinnedImplementation: PINNED_IMPLEMENTATION,
      results: results.map((r) => ({
        caseId: r.caseId,
        via: r.via,
        wrapperOk: r.wrapper?.ok ?? null,
        sold: r.wrapper?.sold ?? false,
        kind: r.classification?.kind,
        accepted: r.classification?.accepted,
        hiddenByWrapperSuccess: r.classification?.hiddenByWrapperSuccess ?? false,
        domainOutcome: r.classification?.domainOutcome ?? null,
      })),
    });
    rmSync(isolate, { recursive: true, force: true });
    process.exit(ok ? 0 : 2);
  } else {
    fail(
      "unknown-command",
      "usage: lifecycle-harness.mjs list | positive | case <id> | test",
      { cases: CASE_IDS },
    );
  }
} finally {
  killPidFile(process.env.D16_PIDFILE);
  killIsolateProcesses(isolate);
}

try {
  rmSync(isolate, { recursive: true, force: true });
} catch {
  /* gone */
}

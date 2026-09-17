import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { bindEngine } from "./bind.mjs";
import { runPublishedJob } from "./engine.mjs";
import { fileRecord, sha256File, sha256Tree } from "./hash.mjs";
import { DESK_JOBS, H32_PRIVATE_MARKERS, PACK_ROOT, PIN } from "./paths.mjs";
import { baseReceipt, honestDelivered, printReceipt, writeReceipt } from "./receipt.mjs";

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `useful-job-desk - caller desk for published useful-jobs ${PIN.engine.version}

Commands:
  pin                         Print the 1.4.7 engine pin
  bind                        Verify and extract the published archive
  run --job <id> --before <f> --after <f> [--used <f>] [--out-dir <d>]
  repeat --job <id> --before <f> --after <f> --after-repeat <f> [--out-dir <d>]
  desk [--out-dir <d>]        Run owned lockfile + vendor callers and changed-input repeats
  verify [--receipt <f>]      Real engine, changed-input repeat, seeded failure, engines unmodified

Notes:
  Own caller files only. --example is refused.
  Repeat requires a changed after file. Same fixture twice labelled repeat demand is refused.
  delivered is true only when the real engine exits 0 and promised outputs exist.
  purchaseAuthority, organicDemand, and repeatDemand stay false.
`;
}

function exitReceipt(receipt, code) {
  printReceipt(receipt);
  process.exit(code);
}

function refuse(code, message, extra = {}, exitCode = 2) {
  exitReceipt(
    baseReceipt({
      ok: false,
      refused: true,
      delivered: false,
      code,
      message,
      ...extra,
    }),
    exitCode,
  );
}

function snapshotCallers(paths) {
  return paths.filter(Boolean).filter((p) => existsSync(p)).map((p) => fileRecord(p, { packRoot: PACK_ROOT }));
}

function publicCallerFiles(records) {
  return records.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
}

function callersUnchanged(before, after) {
  const map = new Map(after.map((f) => [f.abs || f.path, f.sha256]));
  return before.every((f) => map.get(f.abs || f.path) === f.sha256);
}

function requireFiles(pairs) {
  for (const [flag, path] of pairs) {
    if (!path) refuse("missing-required-inputs", `Caller mode requires --${flag}`, { missing: [flag] });
    if (!existsSync(path)) refuse("input-missing", `caller file not found: ${path}`, { flag, path });
  }
}

function collectPackSources(dir = PACK_ROOT) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (name === "out" || name === ".tmp" || name === "node_modules" || name === "receipts") continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) files.push(...collectPackSources(abs));
    else if (st.isFile() && /\.(mjs|js|json|md|txt)$/.test(name)) files.push(abs);
  }
  return files;
}

export function assertNoH32Reopen() {
  const hits = [];
  for (const file of collectPackSources()) {
    const rel = file.slice(PACK_ROOT.length + 1);
    if (rel === "PIN.json" || rel === "SOURCE.txt" || rel === "README.md") continue;
    if (rel.startsWith("lib/paths.mjs")) continue;
    if (rel.startsWith("lib/cli.mjs")) continue;
    if (rel.startsWith("test/")) continue;
    const text = readFileSync(file, "utf8");
    for (const marker of H32_PRIVATE_MARKERS) {
      if (text.includes(marker)) hits.push({ file: rel, marker });
    }
  }
  return hits;
}

function bindOrRefuse(args) {
  try {
    return bindEngine({
      repoRoot: args["repo-root"],
      archivePath: args.archive,
    });
  } catch (err) {
    refuse(err.code || "bind-failed", err.message, err.extra || {});
  }
}

function jobArgsFromFlags(args) {
  const forwarded = [];
  for (const flag of ["before", "after", "used", "input", "next-run", "job-file"]) {
    if (args[flag]) forwarded.push(`--${flag}`, resolve(String(args[flag])));
  }
  if (args["out-dir"]) forwarded.push("--out-dir", resolve(String(args["out-dir"])));
  return forwarded;
}

function runCallerJob(bound, { job, before, after, used, outDir }) {
  const args = ["--before", before, "--after", after];
  if (used) args.push("--used", used);
  const run = runPublishedJob(bound, { job, args, outDir });
  run.delivered = honestDelivered(run);
  if (run.status === 0 && !run.delivered) {
    run.code = "missing-output-not-delivered";
  }
  return run;
}

function summarizeRun(run) {
  return {
    job: run.job,
    status: run.status,
    delivered: run.delivered,
    digest: run.digest,
    engineStatus: run.engineStatus,
    outDir: run.outDir,
    promisedOutputs: run.promisedOutputs,
    presentOutputs: run.presentOutputs,
    missingOutputs: run.missingOutputs,
    code: run.code || null,
    cliInvoked: true,
  };
}

function cmdPin() {
  exitReceipt(
    baseReceipt({
      ok: true,
      refused: false,
      delivered: false,
      code: "pin",
      pin: PIN,
    }),
    0,
  );
}

function cmdBind(args) {
  const bound = bindOrRefuse(args);
  exitReceipt(
    baseReceipt({
      ok: true,
      refused: false,
      delivered: false,
      code: "bound",
      engine: {
        ...baseReceipt().engine,
        kitRoot: PIN.engine.rootName,
        cli: bound.cli,
        cliInvoked: false,
        enginesModified: false,
      },
      kitMatches: bound.kitMatches,
    }),
    0,
  );
}

function cmdRun(args) {
  if (args.example === true) {
    refuse("example-not-caller-file", "--example is a labeled kit sample, not an owned caller file");
  }
  const job = args.job || args._[0];
  if (!job) refuse("missing-required-inputs", "run requires --job", { missing: ["job"] });
  const before = args.before ? resolve(String(args.before)) : null;
  const after = args.after ? resolve(String(args.after)) : null;
  requireFiles([
    ["before", before],
    ["after", after],
  ]);
  const bound = bindOrRefuse(args);
  const outDir = args["out-dir"]
    ? resolve(String(args["out-dir"]))
    : join(PACK_ROOT, "out", "run", job);
  mkdirSync(outDir, { recursive: true });
  const callerBefore = snapshotCallers([before, after, args.used && resolve(String(args.used))]);
  const run = runPublishedJob(bound, { job, args: jobArgsFromFlags({ ...args, "out-dir": outDir }), outDir });
  run.delivered = honestDelivered(run);
  const callerAfter = snapshotCallers(callerBefore.map((f) => f.abs));
  const receipt = baseReceipt({
    ok: run.delivered,
    refused: !run.delivered,
    delivered: run.delivered,
    code: run.delivered ? "delivered" : run.code || (run.status === 0 ? "missing-output-not-delivered" : "engine-refused"),
    message: run.delivered
      ? `real ${PIN.engine.version} engine delivered promised outputs`
      : "engine did not deliver promised outputs",
    callerFiles: publicCallerFiles(callerBefore),
    callerFilesUnchanged: callersUnchanged(callerBefore, callerAfter),
    run: summarizeRun(run),
    engine: {
      ...baseReceipt().engine,
      cliInvoked: true,
      kitRoot: PIN.engine.rootName,
    },
  });
  if (args.receipt) writeReceipt(resolve(String(args.receipt)), receipt);
  exitReceipt(receipt, run.delivered ? 0 : 2);
}

function evaluateRepeatLabel({ afterSha, afterRepeatSha, labelledRepeatDemand }) {
  const sameFixture = afterSha === afterRepeatSha;
  const changedInput = !sameFixture;
  if (labelledRepeatDemand && sameFixture) {
    return {
      refuse: true,
      code: "same-fixture-labelled-repeat-demand",
      message: "same fixture twice labelled repeat demand is refused",
    };
  }
  if (labelledRepeatDemand && changedInput) {
    return {
      refuse: true,
      code: "repeat-demand-unproved",
      message: "changed-input repeat is not organic repeat demand",
    };
  }
  if (sameFixture) {
    return {
      refuse: true,
      code: "unchanged-input-repeat",
      message: "repeat requires a changed after file",
    };
  }
  return { refuse: false, code: "changed-input-repeat", message: "changed-input second run" };
}

function cmdRepeat(args) {
  if (args.example === true) {
    refuse("example-not-caller-file", "--example is a labeled kit sample, not an owned caller file");
  }
  const job = args.job;
  if (!job) refuse("missing-required-inputs", "repeat requires --job", { missing: ["job"] });
  const before = args.before ? resolve(String(args.before)) : null;
  const after = args.after ? resolve(String(args.after)) : null;
  const afterRepeat = args["after-repeat"] ? resolve(String(args["after-repeat"])) : null;
  requireFiles([
    ["before", before],
    ["after", after],
    ["after-repeat", afterRepeat],
  ]);
  const labelledRepeatDemand = Boolean(args["label-repeat-demand"] || args["repeat-demand"]);
  const afterSha = sha256File(after);
  const afterRepeatSha = sha256File(afterRepeat);
  const decision = evaluateRepeatLabel({ afterSha, afterRepeatSha, labelledRepeatDemand });
  const repeatMeta = {
    changedInput: afterSha !== afterRepeatSha,
    sameFixture: afterSha === afterRepeatSha,
    labelledRepeatDemand,
    afterSha256: afterSha,
    afterRepeatSha256: afterRepeatSha,
    repeatDemand: false,
  };
  if (decision.refuse) {
    refuse(decision.code, decision.message, { repeat: repeatMeta });
  }

  const bound = bindOrRefuse(args);
  const outRoot = args["out-dir"] ? resolve(String(args["out-dir"])) : join(PACK_ROOT, "out", "repeat", job);
  const firstDir = join(outRoot, "first");
  const secondDir = join(outRoot, "second");
  mkdirSync(firstDir, { recursive: true });
  mkdirSync(secondDir, { recursive: true });
  const callerBefore = snapshotCallers([before, after, afterRepeat]);
  const first = runCallerJob(bound, { job, before, after, used: args.used, outDir: firstDir });
  const second = runCallerJob(bound, { job, before, after: afterRepeat, used: args.used, outDir: secondDir });
  const callerAfter = snapshotCallers([before, after, afterRepeat]);
  const delivered = first.delivered && second.delivered && first.digest && second.digest && first.digest !== second.digest;
  const receipt = baseReceipt({
    ok: delivered,
    refused: !delivered,
    delivered,
    code: delivered ? "changed-input-repeat" : first.code || second.code || "repeat-not-delivered",
    message: delivered
      ? "changed-input second run delivered different engine output"
      : "repeat did not deliver two distinct engine results",
    repeat: repeatMeta,
    callerFiles: publicCallerFiles(callerBefore),
    callerFilesUnchanged: callersUnchanged(callerBefore, callerAfter),
    first: summarizeRun(first),
    second: summarizeRun(second),
    engine: {
      ...baseReceipt().engine,
      cliInvoked: true,
      kitRoot: PIN.engine.rootName,
    },
  });
  if (args.receipt) writeReceipt(resolve(String(args.receipt)), receipt);
  exitReceipt(receipt, delivered ? 0 : 2);
}

function cmdDesk(args) {
  if (args.example === true) {
    refuse("example-not-caller-file", "--example is a labeled kit sample, not an owned caller file");
  }
  const bound = bindOrRefuse(args);
  const outRoot = args["out-dir"] ? resolve(String(args["out-dir"])) : join(PACK_ROOT, "out", "desk");
  const enginesBefore = existsSync(bound.enginesDir) ? sha256Tree(bound.enginesDir) : null;
  const callerPaths = DESK_JOBS.flatMap((j) => [j.before, j.after, j.afterRepeat]);
  const callerBefore = snapshotCallers(callerPaths);
  const families = [];
  for (const spec of DESK_JOBS) {
    const firstDir = join(outRoot, spec.family, "first");
    const secondDir = join(outRoot, spec.family, "second");
    mkdirSync(firstDir, { recursive: true });
    mkdirSync(secondDir, { recursive: true });
    const first = runCallerJob(bound, {
      job: spec.id,
      before: spec.before,
      after: spec.after,
      outDir: firstDir,
    });
    const afterSha = sha256File(spec.after);
    const afterRepeatSha = sha256File(spec.afterRepeat);
    if (afterSha === afterRepeatSha) {
      refuse("unchanged-input-repeat", "owned after-repeat must differ from after", {
        job: spec.id,
      });
    }
    const second = runCallerJob(bound, {
      job: spec.id,
      before: spec.before,
      after: spec.afterRepeat,
      outDir: secondDir,
    });
    families.push({
      job: spec.id,
      family: spec.family,
      changedInput: true,
      sameFixture: false,
      repeatDemand: false,
      first: summarizeRun(first),
      second: summarizeRun(second),
      distinctDigest: Boolean(first.digest && second.digest && first.digest !== second.digest),
      delivered: first.delivered && second.delivered && first.digest !== second.digest,
    });
  }
  const enginesAfter = existsSync(bound.enginesDir) ? sha256Tree(bound.enginesDir) : null;
  const enginesModified = Boolean(
    enginesBefore && enginesAfter && enginesBefore.sha256 !== enginesAfter.sha256,
  );
  const callerAfter = snapshotCallers(callerPaths);
  const delivered = families.every((f) => f.delivered) && !enginesModified;
  const receipt = baseReceipt({
    ok: delivered,
    refused: !delivered,
    delivered,
    code: delivered ? "desk-delivered" : "desk-not-delivered",
    message: delivered
      ? "owned callers ran on published 1.4.7 with changed-input repeats"
      : "desk did not deliver every owned caller repeat",
    families,
    callerFiles: publicCallerFiles(callerBefore),
    callerFilesUnchanged: callersUnchanged(callerBefore, callerAfter),
    engine: {
      ...baseReceipt().engine,
      cliInvoked: true,
      kitRoot: PIN.engine.rootName,
      enginesModified,
      enginesSha256Before: enginesBefore?.sha256 || null,
      enginesSha256After: enginesAfter?.sha256 || null,
    },
  });
  if (args.receipt) writeReceipt(resolve(String(args.receipt)), receipt);
  exitReceipt(receipt, delivered ? 0 : 2);
}

function cmdVerify(args) {
  const bound = bindOrRefuse(args);
  const h32Hits = assertNoH32Reopen();
  if (h32Hits.length) {
    refuse("h32-private-primitives-reopened", "pack source references H32 private primitives", {
      hits: h32Hits,
    });
  }
  if (existsSync(join(PACK_ROOT, "engines"))) {
    refuse("engines-vendored", "pack must not vendor engines/; bind the published 1.4.7 archive");
  }

  const enginesBefore = sha256Tree(bound.enginesDir);
  const outRoot = args["out-dir"]
    ? resolve(String(args["out-dir"]))
    : join(tmpdir(), `useful-job-desk-verify-${Date.now().toString(36)}`);
  mkdirSync(outRoot, { recursive: true });
  const callerPaths = DESK_JOBS.flatMap((j) => [j.before, j.after, j.afterRepeat]);
  const callerBefore = snapshotCallers(callerPaths);

  const families = [];
  for (const spec of DESK_JOBS) {
    const firstDir = join(outRoot, spec.family, "first");
    const secondDir = join(outRoot, spec.family, "second");
    mkdirSync(firstDir, { recursive: true });
    mkdirSync(secondDir, { recursive: true });
    const first = runCallerJob(bound, {
      job: spec.id,
      before: spec.before,
      after: spec.after,
      outDir: firstDir,
    });
    const second = runCallerJob(bound, {
      job: spec.id,
      before: spec.before,
      after: spec.afterRepeat,
      outDir: secondDir,
    });
    families.push({
      job: spec.id,
      family: spec.family,
      changedInput: sha256File(spec.after) !== sha256File(spec.afterRepeat),
      first: summarizeRun(first),
      second: summarizeRun(second),
      distinctDigest: Boolean(first.digest && second.digest && first.digest !== second.digest),
      delivered: first.delivered && second.delivered && first.digest !== second.digest,
    });
  }

  const vendor = DESK_JOBS.find((j) => j.id === "vendor-budget-impact");
  const seeded = evaluateRepeatLabel({
    afterSha: sha256File(vendor.after),
    afterRepeatSha: sha256File(vendor.after),
    labelledRepeatDemand: true,
  });
  const seededFailure = {
    fixture: "callers/vendor/after.json used twice",
    labelledRepeatDemand: true,
    refused: seeded.refuse === true,
    delivered: false,
    code: seeded.code,
    message: seeded.message,
    repeatDemand: false,
  };

  const enginesAfter = sha256Tree(bound.enginesDir);
  const enginesModified = enginesBefore.sha256 !== enginesAfter.sha256;
  const callerAfter = snapshotCallers(callerPaths);
  const deskOk = families.every((f) => f.delivered);
  const ok =
    deskOk &&
    seededFailure.refused &&
    seededFailure.code === "same-fixture-labelled-repeat-demand" &&
    !enginesModified &&
    callersUnchanged(callerBefore, callerAfter);

  const receipt = baseReceipt({
    ok,
    refused: !ok,
    delivered: deskOk && !enginesModified,
    code: ok ? "verify-passed" : "verify-failed",
    message: ok
      ? "real 1.4.7 engine, owned callers, changed-input repeat, seeded same-fixture refuse, engines unmodified"
      : "verify failed one or more acceptance checks",
    families,
    seededFailure,
    callerFiles: publicCallerFiles(callerBefore),
    callerFilesUnchanged: callersUnchanged(callerBefore, callerAfter),
    engine: {
      ...baseReceipt().engine,
      cliInvoked: true,
      kitRoot: PIN.engine.rootName,
      enginesModified,
      enginesSha256Before: enginesBefore.sha256,
      enginesSha256After: enginesAfter.sha256,
    },
  });
  const receiptPath = args.receipt
    ? resolve(String(args.receipt))
    : join(PACK_ROOT, "receipts", "verify-run.json");
  writeReceipt(receiptPath, receipt);
  receipt.receiptPath = receiptPath.slice(PACK_ROOT.length + 1);
  exitReceipt(receipt, ok ? 0 : 2);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cmd = args._[0] || "help";
  args._ = args._.slice(1);
  if (cmd === "help" || cmd === "--help" || args.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  if (cmd === "pin") return cmdPin();
  if (cmd === "bind") return cmdBind(args);
  if (cmd === "run") return cmdRun(args);
  if (cmd === "repeat") return cmdRepeat(args);
  if (cmd === "desk") return cmdDesk(args);
  if (cmd === "verify") return cmdVerify(args);
  refuse("unknown-command", `unknown command ${cmd}`);
}

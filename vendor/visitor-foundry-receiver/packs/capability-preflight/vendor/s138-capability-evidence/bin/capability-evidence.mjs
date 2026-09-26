#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolvePrerequisites } from "../src/resolve-prerequisites.mjs";
import { bindEvidence } from "../src/bind-evidence.mjs";
import { composePartial } from "../src/compose-partial.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeOut(obj, outPath) {
  const text = `${JSON.stringify(obj, null, 2)}\n`;
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
  }
  process.stdout.write(text);
}

function usage() {
  process.stdout.write(`Usage:
  capability-evidence resolve-prereqs --manifest <file> [--catalog-listed true|false] [--probe <file>] [--out <file>]
  capability-evidence bind-evidence --declaration <file> [--source <file>] [--test-output <file>] [--provenance <file>] [--out <file>]
  capability-evidence compose-partial --job <file> --parts <file>[,file...] [--out <file>]
  capability-evidence demo [--out-dir <dir>]
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    } else out._.push(a);
  }
  return out;
}

async function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (!cmd || cmd === "help" || args.help) {
    usage();
    return 0;
  }

  if (cmd === "resolve-prereqs") {
    if (!args.manifest) throw new Error("--manifest required");
    const manifest = readJson(args.manifest);
    const probe = args.probe ? readJson(args.probe) : {};
    const catalogListed = String(args["catalog-listed"] || "false") === "true";
    const report = resolvePrerequisites({
      manifest,
      manifestKind: args.kind,
      catalogListed,
      probe,
    });
    writeOut(report, args.out);
    return 0;
  }

  if (cmd === "bind-evidence") {
    if (!args.declaration) throw new Error("--declaration required");
    const declaration = readJson(args.declaration);
    const sourcePath = args.source;
    const testPath = args["test-output"];
    const source = sourcePath
      ? { path: sourcePath, content: readFileSync(sourcePath, "utf8") }
      : null;
    const testOutput = testPath
      ? {
          path: testPath,
          content: readFileSync(testPath, "utf8"),
          exitCode: args["exit-code"] != null ? Number(args["exit-code"]) : undefined,
        }
      : null;
    const provenance = args.provenance ? readJson(args.provenance) : null;
    const report = bindEvidence({ declaration, source, testOutput, provenance });
    writeOut(report, args.out);
    return 0;
  }

  if (cmd === "compose-partial") {
    if (!args.job) throw new Error("--job required");
    if (!args.parts) throw new Error("--parts required");
    const job = readJson(args.job);
    const partFiles = String(args.parts)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const parts = partFiles.map((p) => readJson(p));
    const report = composePartial({ job, parts });
    writeOut(report, args.out);
    return 0;
  }

  if (cmd === "demo") {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const outDir = resolve(args["out-dir"] || `${root}/examples/demo-out`);
    mkdirSync(outDir, { recursive: true });

    const prereq = resolvePrerequisites({
      manifest: readJson(`${root}/fixtures/manifests/package-ready.json`),
      manifestKind: "package.json",
      catalogListed: true,
      probe: { nodeVersionSatisfies: true, binExists: ["capability-evidence"] },
    });
    writeFileSync(`${outDir}/02-prereq.json`, `${JSON.stringify(prereq, null, 2)}\n`);

    const bound = bindEvidence({
      declaration: readJson(`${root}/fixtures/evidence/declaration-02.json`),
      source: {
        path: `${root}/src/resolve-prerequisites.mjs`,
        content: readFileSync(`${root}/src/resolve-prerequisites.mjs`, "utf8"),
      },
      testOutput: {
        path: `${root}/fixtures/evidence/sample-tap-pass.txt`,
        content: readFileSync(`${root}/fixtures/evidence/sample-tap-pass.txt`, "utf8"),
        exitCode: 0,
      },
    });
    writeFileSync(`${outDir}/03-bound.json`, `${JSON.stringify(bound, null, 2)}\n`);

    const partial = composePartial({
      job: readJson(`${root}/fixtures/partial/job.json`),
      parts: [
        readJson(`${root}/fixtures/partial/part-a.json`),
        readJson(`${root}/fixtures/partial/part-b-stale.json`),
        readJson(`${root}/fixtures/partial/part-c-ok.json`),
      ],
    });
    writeFileSync(`${outDir}/06-partial.json`, `${JSON.stringify(partial, null, 2)}\n`);

    writeOut(
      {
        schema: "s138.demo.v1",
        outDir,
        artifacts: ["02-prereq.json", "03-bound.json", "06-partial.json"],
      },
      `${outDir}/summary.json`,
    );
    return 0;
  }

  throw new Error(`unknown command ${cmd}`);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code ?? 0),
    (err) => {
      process.stderr.write(`${err.message || err}\n`);
      process.exit(1);
    },
  );
}

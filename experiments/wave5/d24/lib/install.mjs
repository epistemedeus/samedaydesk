import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PINS } from "./pins.mjs";
import { pinAssetPaths, requirePinAssets, siblingTrees, sdsRepoRoot } from "./locate.mjs";

const SKIP = new Set(["node_modules", ".git", "__pycache__", ".venv"]);

function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (path) => {
      const parts = path.split("/").filter(Boolean);
      return !parts.some((part) => SKIP.has(part));
    },
  });
}

function stageClientPins(layoutRoot, assets) {
  const useful = join(layoutRoot, "client/public/for-agents/useful-jobs");
  const data = join(layoutRoot, "client/src/data");
  mkdirSync(useful, { recursive: true });
  mkdirSync(data, { recursive: true });
  cpSync(assets.archive, join(useful, "useful-jobs-1.0.0.tar.gz"));
  cpSync(assets.catalog, join(useful, "catalog.json"));
  cpSync(assets.kit, join(data, "usefulJobsKit.json"));
}

function run(cmd, args, opts) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

export function prefixLayout(prefix) {
  return {
    prefix,
    venv: join(prefix, "venv"),
    pythonSrc: join(prefix, "packages/python-useful-jobs-client"),
    assets: join(prefix, "assets"),
    caller: join(prefix, "caller"),
    d01: join(prefix, "d01"),
    d07: join(prefix, "d07"),
    work: join(prefix, "work"),
    vendorTrap: join(prefix, "vendor-only"),
  };
}

export function pythonBin(prefix) {
  return join(prefixLayout(prefix).venv, "bin/python3");
}

export function pythonCli(prefix) {
  return join(prefixLayout(prefix).venv, "bin/samedaydesk-useful-jobs");
}

export function d01Cli(prefix) {
  return join(prefixLayout(prefix).d01, "server/paid-useful-jobs/bin/cli.mjs");
}

export function d07Cli(prefix) {
  return join(prefixLayout(prefix).d07, "tools/job-artifact-export/bin/export.mjs");
}

/**
 * Install D01, D07 and Co14 into an isolated prefix.
 * Copies sibling owned trees at runtime. Does not vendor them into this branch.
 */
export function installCleanPrefix(prefix, { trees = siblingTrees(), assets = requirePinAssets() } = {}) {
  rmSync(prefix, { recursive: true, force: true });
  const layout = prefixLayout(prefix);
  mkdirSync(layout.assets, { recursive: true });
  mkdirSync(layout.caller, { recursive: true });
  mkdirSync(layout.work, { recursive: true });

  cpSync(assets.archive, join(layout.assets, "useful-jobs-1.0.0.tar.gz"));
  cpSync(assets.catalog, join(layout.assets, "catalog.json"));
  cpSync(assets.kit, join(layout.assets, "usefulJobsKit.json"));

  copyTree(join(trees.d08, "tools/python-useful-jobs-client"), layout.pythonSrc);
  copyTree(join(trees.d01, "server/paid-useful-jobs"), join(layout.d01, "server/paid-useful-jobs"));
  stageClientPins(layout.d01, assets);
  copyTree(join(trees.d07, "tools/job-artifact-export"), join(layout.d07, "tools/job-artifact-export"));
  stageClientPins(layout.d07, assets);

  mkdirSync(layout.vendorTrap, { recursive: true });
  writeFileSync(join(layout.vendorTrap, "README.txt"), "vendor placeholder; not an installable client\n");

  run("python3", ["-m", "venv", layout.venv]);
  const pip = join(layout.venv, "bin/pip");
  run(pip, ["install", "--disable-pip-version-check", "--no-input", layout.pythonSrc]);

  writeFileSync(
    join(prefix, "INSTALL.json"),
    `${JSON.stringify(
      {
        ok: true,
        tested: PINS.tested,
        archiveSha256: PINS.archive.sha256,
        sourceCheckout: sdsRepoRoot(),
        pinAssets: pinAssetPaths(),
        pythonCli: pythonCli(prefix),
        d01Cli: d01Cli(prefix),
        d07Cli: d07Cli(prefix),
      },
      null,
      2,
    )}\n`,
  );
  return layout;
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function installedPythonModulePath(prefix) {
  const result = spawnSync(
    pythonBin(prefix),
    ["-c", "import samedaydesk_useful_jobs, pathlib; print(pathlib.Path(samedaydesk_useful_jobs.__file__).resolve())"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`python import failed: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout).trim();
}

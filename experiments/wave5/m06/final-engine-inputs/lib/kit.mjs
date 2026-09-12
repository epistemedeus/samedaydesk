import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadPin } from "./paths.mjs";

export class KitIncomplete extends Error {
  constructor(message) {
    super(message);
    this.name = "KitIncomplete";
    this.incomplete = true;
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function candidateArchives(pin) {
  const rel = pin.publicKit.archive;
  const named = process.env.W5_M06_KIT_ARCHIVE;
  return [
    named,
    "/tmp/w5-m06-pr114-ro/" + rel,
    "/tmp/w5-m06-d01-ro/" + rel,
  ].filter(Boolean);
}

function candidateRoots() {
  const named = process.env.W5_M06_KIT_ROOT;
  return [named, "/tmp/w5-m06-kit-1.2.0/useful-jobs-1.2.0"].filter(Boolean);
}

function kitLooksReady(root, pin) {
  const bin = join(root, "bin", "useful-jobs.mjs");
  const compare = join(root, pin.enginePin.compareRel);
  return existsSync(bin) && existsSync(compare);
}

function assertComparePin(root, pin) {
  const compare = join(root, pin.enginePin.compareRel);
  const got = sha256File(compare);
  if (got !== pin.enginePin.compareSha256) {
    throw new KitIncomplete(
      `kit compare.mjs sha256 ${got} != pin ${pin.enginePin.compareSha256}`,
    );
  }
}

function extractArchive(archive, pin) {
  const destParent = join(tmpdir(), "w5-m06-final-engine-inputs-kit");
  const root = join(destParent, "useful-jobs-1.2.0");
  if (kitLooksReady(root, pin)) {
    assertComparePin(root, pin);
    return { root, source: "extracted-cache", archive };
  }
  mkdirSync(destParent, { recursive: true });
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }
  const unpacked = spawnSync("tar", ["-xzf", archive, "-C", destParent], {
    encoding: "utf8",
  });
  if (unpacked.status !== 0) {
    throw new KitIncomplete(`tar extract failed: ${unpacked.stderr || unpacked.stdout}`);
  }
  if (!kitLooksReady(root, pin)) {
    throw new KitIncomplete(`extracted archive missing ${pin.publicKit.defaultCli.join(" ")}`);
  }
  assertComparePin(root, pin);
  return { root, source: "extracted", archive };
}

export function resolveKit(pin = loadPin()) {
  for (const root of candidateRoots()) {
    if (kitLooksReady(root, pin)) {
      assertComparePin(root, pin);
      return {
        root,
        source: process.env.W5_M06_KIT_ROOT === root ? "env" : "extracted-cache",
        bin: join(root, "bin", "useful-jobs.mjs"),
        cli: pin.publicKit.defaultCli,
      };
    }
  }
  for (const archive of candidateArchives(pin)) {
    if (!existsSync(archive)) continue;
    const got = sha256File(archive);
    if (got !== pin.publicKit.sha256) {
      throw new KitIncomplete(`archive sha256 ${got} != pin ${pin.publicKit.sha256}`);
    }
    const bytes = readFileSync(archive).length;
    if (bytes !== pin.publicKit.bytes) {
      throw new KitIncomplete(`archive bytes ${bytes} != pin ${pin.publicKit.bytes}`);
    }
    const extracted = extractArchive(archive, pin);
    return {
      root: extracted.root,
      source: extracted.source,
      archive,
      bin: join(extracted.root, "bin", "useful-jobs.mjs"),
      cli: pin.publicKit.defaultCli,
    };
  }
  throw new KitIncomplete(
    "useful-jobs 1.2.0 kit not found; set W5_M06_KIT_ROOT or W5_M06_KIT_ARCHIVE",
  );
}

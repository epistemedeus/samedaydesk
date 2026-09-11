import { existsSync } from "node:fs";
import { join } from "node:path";
import { installedPythonModulePath, prefixLayout } from "./install.mjs";
import { sdsRepoRoot } from "./locate.mjs";

const MONOREPO_MARKERS = [
  "vendor/neomorphic-correspondence",
  "client/src/pages",
  "package-lock.json",
  "overlays",
];

export function assertCleanPrefix(prefix) {
  const layout = prefixLayout(prefix);
  const missing = [];
  if (!existsSync(join(layout.bin, "samedaydesk-useful-jobs"))) missing.push("python-cli");
  if (!existsSync(join(layout.d01, "server/paid-useful-jobs/bin/cli.mjs"))) missing.push("d01-cli");
  if (!existsSync(join(layout.d07, "tools/job-artifact-export/bin/export.mjs"))) missing.push("d07-cli");
  if (missing.length) {
    return { ok: false, code: "incomplete-install", missing };
  }

  const accidents = [];
  for (const marker of MONOREPO_MARKERS) {
    if (existsSync(join(prefix, marker))) accidents.push(marker);
    if (existsSync(join(layout.d01, marker)) && marker !== "package-lock.json") accidents.push(`d01/${marker}`);
  }
  if (existsSync(join(layout.d01, "vendor/neomorphic-correspondence"))) {
    accidents.push("d01-vendor-correspondence");
  }

  const modulePath = installedPythonModulePath(prefix);
  const checkout = sdsRepoRoot();
  const importedFromCheckout = modulePath.startsWith(join(checkout, "tools/python-useful-jobs-client"));
  const importedFromPrefix = modulePath.startsWith(layout.pythonSrc);

  return {
    ok: accidents.length === 0 && importedFromPrefix && !importedFromCheckout,
    pythonModule: modulePath,
    importedFromPrefix,
    importedFromCheckout,
    accidents,
    checkout,
  };
}

export function vendorOnlyCannotImport(prefix) {
  const layout = prefixLayout(prefix);
  return {
    vendorTrap: layout.vendorTrap,
    hasPythonCli: existsSync(join(layout.vendorTrap, "bin/samedaydesk-useful-jobs")),
  };
}

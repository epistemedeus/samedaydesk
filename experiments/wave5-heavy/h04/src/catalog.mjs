import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { EXAMPLES_DIR, FAMILIES } from "./paths.mjs";

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((ent) => ent.isDirectory())
      .map((ent) => ent.name)
      .sort();
  } catch {
    return [];
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function findExampleJsonFiles(root) {
  const out = [];
  const walk = (dir) => {
    let ents;
    try {
      ents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const path = join(dir, ent.name);
      if (ent.isDirectory()) walk(path);
      else if (ent.isFile() && ent.name === "example.json") out.push(path);
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Load example.json files from examples/{family}/<id>/example.json.
 * Missing families are tolerated (other children may still be writing).
 * Never throws on empty or absent trees.
 */
export function loadCatalog({ examplesDir = EXAMPLES_DIR } = {}) {
  const examples = [];
  const missingFamilies = [];
  const errors = [];

  if (!existsSync(examplesDir)) {
    return {
      examples,
      missingFamilies: [...FAMILIES],
      errors,
      examplesDir,
    };
  }

  for (const family of FAMILIES) {
    const familyDir = join(examplesDir, family);
    if (!existsSync(familyDir) || !statSync(familyDir).isDirectory()) {
      missingFamilies.push(family);
      continue;
    }
    const found = findExampleJsonFiles(familyDir);
    if (found.length === 0) {
      continue;
    }
    for (const file of found) {
      const dir = dirname(file);
      try {
        const data = readJson(file);
        const id = data.id || basename(dir);
        const expectedReportPath = join(dir, "expected-report.json");
        const expectedFactsPath = join(dir, "expected-facts.json");
        const expectedRefusalPath = join(dir, "expected-refusal.json");
        const expectedNoChangePath = join(dir, "expected-no-change.json");
        examples.push({
          ...data,
          id,
          family: data.family || family,
          dir,
          examplePath: file,
          expectedReportPath: existsSync(expectedReportPath) ? expectedReportPath : null,
          expectedFactsPath: existsSync(expectedFactsPath) ? expectedFactsPath : null,
          expectedRefusalPath: existsSync(expectedRefusalPath) ? expectedRefusalPath : null,
          expectedNoChangePath: existsSync(expectedNoChangePath) ? expectedNoChangePath : null,
        });
      } catch (err) {
        errors.push({ family, id: basename(dir), path: file, error: err.message });
      }
    }
  }

  return { examples, missingFamilies, errors, examplesDir };
}

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
    const children = listDirs(familyDir);
    if (children.length === 0) {
      // Family folder exists but has no examples yet — not an error.
      continue;
    }
    for (const name of children) {
      const dir = join(familyDir, name);
      const file = join(dir, "example.json");
      if (!existsSync(file)) continue;
      try {
        const data = readJson(file);
        const id = data.id || name;
        const expectedReportPath = join(dir, "expected-report.json");
        examples.push({
          ...data,
          id,
          family: data.family || family,
          dir,
          examplePath: file,
          expectedReportPath: existsSync(expectedReportPath) ? expectedReportPath : null,
        });
      } catch (err) {
        errors.push({ family, id: name, path: file, error: err.message });
      }
    }
  }

  return { examples, missingFamilies, errors, examplesDir };
}

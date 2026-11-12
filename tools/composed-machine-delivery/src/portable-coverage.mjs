import { createHash } from "node:crypto";

export const COVERAGE_MEMBER = "tools/task-repeat-use/src/coverage.mjs";

const SOURCE_SHA256 = "fae3a3aa505eebfa2d80d735a44bec3b6189aebff0b6e505378b37bc43ea51bc";
const PORTABLE_SHA256 = "94b915c37410323f07ed50899c77d4dcd684606f298dc99ff444478254b4940f";

export function portableCoverage(source) {
  const sha256 = createHash("sha256").update(source).digest("hex");
  if (sha256 === PORTABLE_SHA256) return source;
  if (sha256 !== SOURCE_SHA256) throw new Error("task-repeat-use coverage source changed; review the archive projection");

  // Preserve the owner's public route and pin checks. The archived CLI can
  // exercise actual reuse but cannot attest to internal enrollment records.
  return source
    .replace('import { readFileSync } from "node:fs";\n', "")
    .replace(/function readJson\(path\) \{[\s\S]*?\nexport function loadCoverage\(\) \{[\s\S]*?(?=  if \(MACHINE_ENTRY_PIN)/,
      'export function loadCoverage() {\n  const problems = [];\n\n')
    .replace(/    installedAtThatReceiving: enrollment\.installed === true,\n\s+qualified: enrollment\.qualified === true,\n\s+received: enrollment\.received === true,/,
      '    installedAtThatReceiving: null,\n      qualified: null,\n      received: null,\n      receivingEvidence: "excluded_from_consumer_archive",');
}

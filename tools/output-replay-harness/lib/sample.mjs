import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function siblingSampleMarker(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  return names.find((n) => /^SAMPLE(\.|$)/i.test(n) || /\.SAMPLE\./i.test(n)) || null;
}

/**
 * SAMPLE / --example detection.
 *
 * samples/openapi/a is the unlabeled package example tree used as caller files
 * for the customer replay journey. It has no SAMPLE.txt and is not treated
 * as a SAMPLE run. caller-alpha / caller-beta carry SAMPLE.txt and stay sample.
 */
export function inspectSample({ example = false, inputs = {} } = {}) {
  const reasons = [];
  if (example === true || example === "true") reasons.push("example-flag");
  for (const [key, value] of Object.entries(inputs || {})) {
    if (typeof value !== "string" || !value) continue;
    const abs = resolve(value);
    if (!existsSync(abs)) continue;
    if (siblingSampleMarker(abs)) reasons.push(`sibling-marker:${key}`);
    try {
      const text = readFileSync(abs, "utf8");
      if (/<!--\s*SAMPLE fixture/i.test(text) || /^SAMPLE - not a customer/m.test(text)) {
        reasons.push(`labelled-sample-text:${key}`);
      }
    } catch {
      /* unreadable */
    }
  }
  const unique = [...new Set(reasons)];
  return { sample: unique.length > 0, reasons: unique };
}

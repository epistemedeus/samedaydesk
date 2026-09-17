import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
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

export function resolveInputPath(p, cwd = process.cwd()) {
  if (p == null) return null;
  const s = String(p);
  if (/^https?:\/\//i.test(s)) return s;
  if (isAbsolute(s)) return s;
  return resolve(cwd, s);
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

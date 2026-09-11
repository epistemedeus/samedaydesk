import { join } from "node:path";
import { packFixtures } from "../scripts/pack-fixtures.mjs";
import { FIXTURES_ROOT, PACKAGE_ROOT } from "../src/paths.mjs";

let packed = false;

export function ensureFixtures() {
  if (packed) return;
  packFixtures();
  packed = true;
}

export function fixtureDir(name) {
  return join(FIXTURES_ROOT, name);
}

export { PACKAGE_ROOT };

export function captureIo() {
  let out = "";
  let err = "";
  return {
    get out() {
      return out;
    },
    get err() {
      return err;
    },
    stdout: { write(chunk) { out += String(chunk); } },
    stderr: { write(chunk) { err += String(chunk); } },
  };
}

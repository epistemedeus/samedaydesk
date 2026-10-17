/**
 * Load seeded fixture JSON. Confined to this pack's fixtures/ (realpath).
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import { packDir } from "./repo.mjs";

export function fixturesRoot() {
  return resolve(packDir(), "fixtures");
}

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function underFixtures(abs, fixtures) {
  return abs === fixtures || abs.startsWith(`${fixtures}/`);
}

/**
 * Resolve --fixture PATH against cwd, repo root, pack dir, then fixtures/.
 * Existing files outside fixtures/ are FIXTURE_ESCAPE (never parsed).
 */
export function loadFixtureFile(path, root) {
  if (!path || typeof path !== "string") {
    fail("USAGE", "fixture path required");
  }

  const pack = packDir();
  const fixtures = fixturesRoot();
  const candidates = [];
  if (isAbsolute(path)) candidates.push(path);
  else {
    candidates.push(resolve(process.cwd(), path));
    if (root) candidates.push(resolve(root, path));
    candidates.push(resolve(pack, path));
    candidates.push(resolve(fixtures, path));
    candidates.push(join(fixtures, path));
  }

  let abs = null;
  let outsideExisting = null;
  for (const full of candidates) {
    const resolved = resolve(full);
    const inside = underFixtures(resolved, fixtures);
    if (!inside) {
      if (existsSync(resolved)) outsideExisting = resolved;
      continue;
    }
    if (existsSync(resolved)) {
      abs = resolved;
      break;
    }
  }

  if (!abs) {
    if (outsideExisting) {
      fail("FIXTURE_ESCAPE", `fixture path escapes fixtures/: ${path}`);
    }
    fail("FIXTURE_MISSING", `fixture not found: ${path}`);
  }

  if (extname(abs) !== ".json") {
    fail("FIXTURE_INVALID", `fixture must be a .json file: ${path}`);
  }
  if (!statSync(abs).isFile()) {
    fail("FIXTURE_INVALID", `fixture is not a file: ${path}`);
  }

  let real;
  try {
    real = realpathSync(abs);
  } catch (err) {
    fail("FIXTURE_INVALID", `fixture unreadable: ${path}: ${err.message}`);
  }
  if (!underFixtures(real, fixtures)) {
    fail("FIXTURE_ESCAPE", `fixture realpath escapes fixtures/: ${path}`);
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    fail("FIXTURE_INVALID", `fixture is not JSON: ${path}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("FIXTURE_INVALID", `fixture must be a JSON object: ${path}`);
  }
  return raw;
}

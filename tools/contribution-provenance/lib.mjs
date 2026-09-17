import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG = join(here, "catalog.json");
const OBJECT_STORE = join(here, "fixtures/object-store");
const VALID_FIXTURES = join(here, "fixtures/valid");
const INVALID_FIXTURES = join(here, "fixtures/invalid");
const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");
const REPO_GIT = join(here, "../../.git");

export const UNBOUND_CODE = "claimed_hash_unbound_object";
export const VERANTIS_PR2_HEAD = "072f8d04026bb29a62dbf8a761a2ae62abbdc663";
export const VERANTIS_PR2_ABBREV = "072f8d0";
export const SDS_PIN = "775051602d91f42ca1aa920054cfd7a451982940";
export const S122_UNRESOLVED = "c0255ac";

const HASH_RE = /^[0-9a-f]{7,40}$/i;
const CLAIM_ID_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const INFERENCE_RE = /^[a-z][a-z0-9_]{1,63}$/;
const SURFACE_RE = /^[a-z][a-z0-9_]{1,63}$/;
const TEXT_RE = /^[\x20-\x7E\n]{0,4000}$/;

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "claimId",
  "actorLabel",
  "adoption",
  "claimedHash",
  "claimedSignature",
  "surface",
  "text",
  "notes",
  "prohibitedInferences",
]);

export function defaultCatalogPath() {
  return DEFAULT_CATALOG;
}

export function objectStoreGitDir() {
  return OBJECT_STORE;
}

export function validFixtureDir() {
  return VALID_FIXTURES;
}

export function invalidFixtureDir() {
  return INVALID_FIXTURES;
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.actorLabels)) {
    throw new Error("catalog must contain actorLabels");
  }
  return catalog;
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function loadInvalidManifest(manifestPath = INVALID_MANIFEST) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function defaultGitDirs({ extraGitDirs = [] } = {}) {
  const dirs = [];
  const seen = new Set();
  function add(dir) {
    if (!dir || seen.has(dir)) return;
    if (!existsSync(dir)) return;
    seen.add(dir);
    dirs.push(dir);
  }
  for (const dir of extraGitDirs) add(dir);
  add(OBJECT_STORE);
  add(REPO_GIT);
  add(cwdGitDir());
  return dirs;
}

function cwdGitDir() {
  const result = spawnSync("git", ["rev-parse", "--absolute-git-dir"], {
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.status !== 0) return null;
  const dir = (result.stdout || "").trim();
  return dir || null;
}

function error(code, path, message) {
  return { code, path, message };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownKeys(value) {
  return Object.getOwnPropertyNames(value);
}

function allowKeys(obj, allowed, path, errors) {
  const allowedSet = new Set(allowed);
  for (const key of ownKeys(obj)) {
    if (FORBIDDEN_KEYS.has(key) || !allowedSet.has(key)) {
      errors.push(error("additional_property", `${path}.${key}`, `property ${key} is not allowed`));
    }
  }
}

function expectString(value, re, path, errors, code = "invalid_shape") {
  if (typeof value !== "string" || !re.test(value)) {
    errors.push(error(code, path, "invalid string"));
    return false;
  }
  return true;
}

/**
 * Run `git cat-file -t` against each local git directory until one knows the
 * object. No remotes, no GitHub API. A miss is `claimed_hash_unbound_object`.
 */
export function catFileType(hash, gitDirs = defaultGitDirs()) {
  if (typeof hash !== "string" || !HASH_RE.test(hash)) {
    return {
      ok: false,
      code: "invalid_claimed_hash",
      claimedHash: hash,
      objectType: null,
      gitDir: null,
      gitCatFileExit: null,
    };
  }

  const attempts = [];
  for (const gitDir of gitDirs) {
    const result = spawnSync("git", ["--git-dir", gitDir, "cat-file", "-t", hash], {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const objectType = (result.stdout || "").trim() || null;
    attempts.push({
      gitDir,
      exit: result.status === null ? 1 : result.status,
      objectType,
    });
    if (result.status === 0 && objectType) {
      return {
        ok: true,
        code: null,
        claimedHash: hash,
        objectType,
        gitDir,
        gitCatFileExit: 0,
        attempts,
      };
    }
  }

  const lastExit = attempts.length ? attempts[attempts.length - 1].exit : 128;
  return {
    ok: false,
    code: UNBOUND_CODE,
    claimedHash: hash,
    objectType: null,
    gitDir: null,
    gitCatFileExit: lastExit === 0 ? 128 : lastExit,
    attempts,
  };
}

export function bindClaimedHash(hash, gitDirs = defaultGitDirs()) {
  const bound = catFileType(hash, gitDirs);
  if (!bound.ok) {
    return {
      ok: false,
      code: bound.code,
      claimedHash: hash,
      objectType: null,
      gitDir: bound.gitDir,
      gitCatFileExit: bound.gitCatFileExit,
      adoption: "lead",
      textIsLeadOnly: true,
      errors: [
        error(
          bound.code,
          "$.claimedHash",
          bound.code === UNBOUND_CODE
            ? "claimed hash is not a git object in the local object stores"
            : "claimed hash is not a git object name",
        ),
      ],
    };
  }
  return {
    ok: true,
    code: null,
    claimedHash: hash,
    objectType: bound.objectType,
    gitDir: bound.gitDir,
    gitCatFileExit: 0,
    adoption: "object_bound",
    textIsLeadOnly: false,
    errors: [],
  };
}

function expectUniqueStringArray(value, path, errors, itemRe, { min, max }) {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length) {
    errors.push(error("invalid_shape", path, "expected array"));
    return false;
  }
  if (value.length < min || value.length > max) {
    errors.push(error("invalid_shape", path, `expected ${min} to ${max} items`));
    return false;
  }
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== "string" || (itemRe && !itemRe.test(item))) {
      errors.push(error("invalid_shape", `${path}[${i}]`, "invalid item"));
      continue;
    }
    if (seen.has(item)) {
      errors.push(error("invalid_shape", `${path}[${i}]`, "duplicate item"));
    }
    seen.add(item);
  }
  return true;
}

export function evaluateClaim(input, { catalog = loadCatalog(), gitDirs = defaultGitDirs() } = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return {
      ok: false,
      code: "invalid_shape",
      errors: [error("invalid_shape", "$", "claim must be a plain object")],
    };
  }

  allowKeys(input, ROOT_KEYS, "$", errors);
  for (const key of ["schemaVersion", "claimId", "actorLabel", "adoption", "prohibitedInferences"]) {
    if (!Object.hasOwn(input, key)) {
      errors.push(error("invalid_shape", "$", `missing ${key}`));
    }
  }

  if (input.schemaVersion !== catalog.schemaVersion) {
    errors.push(error("unknown_schema_version", "$.schemaVersion", "unsupported schemaVersion"));
  }
  expectString(input.claimId, CLAIM_ID_RE, "$.claimId", errors);

  if (!catalog.actorLabels.includes(input.actorLabel)) {
    errors.push(error("unknown_actor_label", "$.actorLabel", "actorLabel is not in the closed set"));
  }
  if (!catalog.adoptionStates.includes(input.adoption)) {
    errors.push(error("invalid_adoption", "$.adoption", "adoption is not in the closed set"));
  }

  if (Object.hasOwn(input, "surface")) {
    if (Array.isArray(catalog.surfaces) && catalog.surfaces.length > 0) {
      if (!catalog.surfaces.includes(input.surface)) {
        errors.push(error("invalid_shape", "$.surface", "unknown surface"));
      }
    } else {
      expectString(input.surface, SURFACE_RE, "$.surface", errors);
    }
  }
  if (Object.hasOwn(input, "text")) {
    expectString(input.text, TEXT_RE, "$.text", errors);
  }
  if (Object.hasOwn(input, "notes")) {
    expectString(input.notes, TEXT_RE, "$.notes", errors);
  }

  const inferenceOk = expectUniqueStringArray(
    input.prohibitedInferences,
    "$.prohibitedInferences",
    errors,
    INFERENCE_RE,
    { min: 3, max: 16 },
  );
  if (inferenceOk && Array.isArray(input.prohibitedInferences)) {
    const listed = new Set(input.prohibitedInferences);
    for (const required of catalog.requiredProhibitedInferences) {
      if (!listed.has(required)) {
        errors.push(
          error("missing_prohibited_inference", "$.prohibitedInferences", `missing ${required}`),
        );
      }
    }
  }

  const hasHash = Object.hasOwn(input, "claimedHash") && input.claimedHash !== null;
  const hasSignature = Object.hasOwn(input, "claimedSignature") && input.claimedSignature !== null;
  let bound = null;

  if (hasHash) {
    if (typeof input.claimedHash !== "string" || !HASH_RE.test(input.claimedHash)) {
      errors.push(error("invalid_claimed_hash", "$.claimedHash", "claimed hash is not a git object name"));
    } else {
      bound = bindClaimedHash(input.claimedHash, gitDirs);
      if (!bound.ok) {
        errors.push(...bound.errors);
      }
    }
  } else if (hasSignature) {
    if (typeof input.claimedSignature !== "string" || input.claimedSignature.length === 0) {
      errors.push(error("invalid_shape", "$.claimedSignature", "invalid claimedSignature"));
    } else {
      errors.push(
        error(
          UNBOUND_CODE,
          "$.claimedSignature",
          "claimed signature does not bind a git object",
        ),
      );
    }
  }

  if (hasSignature && input.claimedSignature !== null && typeof input.claimedSignature !== "string") {
    errors.push(error("invalid_shape", "$.claimedSignature", "claimedSignature must be a string or null"));
  }

  if (input.adoption === "owner_adopted") {
    if (input.actorLabel === "commenter") {
      errors.push(
        error(
          "comment_text_is_not_adoption",
          "$.adoption",
          "commenter text is a lead, not adoption",
        ),
      );
    } else if (input.actorLabel !== "owner") {
      errors.push(
        error("actor_cannot_adopt", "$.adoption", "owner_adopted requires actorLabel owner"),
      );
    }
    if (!bound || !bound.ok) {
      errors.push(
        error(
          UNBOUND_CODE,
          "$.claimedHash",
          "owner adoption requires a claimed hash that binds a git object",
        ),
      );
    }
  }

  if (input.adoption === "object_bound" && (!bound || !bound.ok)) {
    if (!errors.some((item) => item.code === UNBOUND_CODE || item.code === "invalid_claimed_hash")) {
      errors.push(
        error(UNBOUND_CODE, "$.claimedHash", "object_bound requires a claimed hash that binds a git object"),
      );
    }
  }

  if (input.adoption !== "lead" && !hasHash && !hasSignature) {
    errors.push(
      error(
        "comment_text_is_not_adoption",
        "$.adoption",
        "solution-shaped text without a bound git object is a lead",
      ),
    );
  }

  const first = errors[0];
  const objectType = bound && bound.ok ? bound.objectType : null;
  const textIsLeadOnly = !objectType;
  return {
    ok: errors.length === 0,
    code: errors.length === 0 ? null : first.code,
    claimId: typeof input.claimId === "string" ? input.claimId : null,
    actorLabel: input.actorLabel,
    adoption: input.adoption,
    claimedHash: hasHash ? input.claimedHash : null,
    objectType,
    gitDir: bound && bound.ok ? bound.gitDir : null,
    gitCatFileExit: bound ? bound.gitCatFileExit : null,
    textIsLeadOnly,
    errors,
  };
}

export function evaluateFile(filePath, options = {}) {
  let claim;
  try {
    claim = loadJson(filePath);
  } catch (cause) {
    return {
      ok: false,
      code: "invalid_shape",
      filePath,
      errors: [error("invalid_shape", "$", `cannot parse JSON: ${cause.message}`)],
    };
  }
  const result = evaluateClaim(claim, options);
  return { ...result, filePath };
}

export function runSuite(options = {}) {
  const catalog = options.catalog ?? loadCatalog();
  const gitDirs = options.gitDirs ?? defaultGitDirs();
  const results = [];
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const result = evaluateFile(filePath, { catalog, gitDirs });
    results.push({
      filePath,
      expect: "accept",
      ok: result.ok,
      errors: result.errors,
      actorLabel: result.actorLabel,
      objectType: result.objectType,
      code: result.code,
    });
  }

  const manifest = loadInvalidManifest();
  for (const [name, spec] of Object.entries(manifest)) {
    const filePath = join(INVALID_FIXTURES, name);
    const result = evaluateFile(filePath, { catalog, gitDirs });
    const codes = result.errors.map((item) => item.code);
    const matched = !result.ok && codes.includes(spec.code);
    results.push({
      filePath,
      expect: "reject",
      expectedCode: spec.code,
      ok: matched,
      errors: result.errors,
      actorLabel: result.actorLabel,
      objectType: result.objectType,
      code: result.code,
    });
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  return {
    ok: failed === 0,
    passed,
    failed,
    total: results.length,
    results,
  };
}

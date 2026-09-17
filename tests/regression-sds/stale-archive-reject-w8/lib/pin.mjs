import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOUNDARY,
  FEATURE,
  NEGATIVE_CONTROL_VERSION,
  OBTAIN_ARCHIVE_REL,
  PRINCIPLE,
  REPO_ROOT,
  WRITE_BOUNDARY,
} from "./root.mjs";

export { BOUNDARY, FEATURE, PRINCIPLE, WRITE_BOUNDARY };

const KIT_REL = "client/src/data/usefulJobsKit.json";
const CATALOG_REL = "client/public/for-agents/useful-jobs/catalog.json";
const DISCOVERY_REL = "client/public/discovery/useful-jobs.json";

/** Documented current pin; loadPins fails if committed files drift. */
export const EXPECTED_CURRENT = Object.freeze({
  version: "1.4.7",
  sha256: "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  bytes: 5255824,
  rootName: "useful-jobs-1.4.7",
});

export const PIN_CITES = Object.freeze([
  {
    id: "useful-jobs-kit-current",
    rel: KIT_REL,
    needles: [
      '"version": "1.4.7"',
      '"sha256": "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec"',
      '"bytes": 5255824',
      '"rootName": "useful-jobs-1.4.7"',
    ],
  },
  {
    id: "useful-jobs-kit-negative-110",
    rel: KIT_REL,
    needles: [
      '"version": "1.1.0"',
      '"sha256": "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534"',
      '"bytes": 2577606',
      '"rootName": "useful-jobs-1.1.0"',
    ],
  },
  {
    id: "catalog-current-version",
    rel: CATALOG_REL,
    needles: ['"version": "1.4.7"'],
  },
  {
    id: "obtain-archive-wrong-digest",
    rel: OBTAIN_ARCHIVE_REL,
    needles: [
      'fail("wrong-digest"',
      'fail("wrong-size"',
      "process.exit(0)",
      "extracted: false",
    ],
  },
  {
    id: "public-110-not-current",
    rel: "experiments/s260-useful-jobs-public-integration/test/public-1.1.0-cold.test.mjs",
    needles: [
      'test("1.1.0 archive bytes stay pinned and are not the current catalog"',
      'assert.notEqual(liveCatalog.version, "1.1.0")',
    ],
  },
]);

function publicRel(webPath) {
  return join("client/public", String(webPath).replace(/^\//, ""));
}

export function readKitPin() {
  const abs = join(REPO_ROOT, KIT_REL);
  const kit = JSON.parse(readFileSync(abs, "utf8"));
  const immutable = Array.isArray(kit.immutableArchives) ? kit.immutableArchives : [];
  return {
    version: kit.version,
    sha256: String(kit.sha256 || "").toLowerCase(),
    bytes: kit.bytes,
    rootName: kit.rootName,
    archiveRel: publicRel(kit.archive),
    kitArchiveRel: publicRel(kit.kitArchive),
    previous: kit.previous || null,
    immutable: immutable.map((row) => ({
      version: row.version,
      sha256: String(row.sha256 || "").toLowerCase(),
      bytes: row.bytes,
      rootName: row.rootName,
      archiveRel: publicRel(row.archive),
      kitArchiveRel: publicRel(row.kitArchive),
    })),
  };
}

export function stalePinsFromKit(kit = readKitPin()) {
  const out = {};
  for (const row of kit.immutable) {
    out[row.version] = Object.freeze({ ...row });
  }
  return Object.freeze(out);
}

function scanCite(cite) {
  const abs = join(REPO_ROOT, cite.rel);
  if (!existsSync(abs)) {
    return {
      id: cite.id,
      rel: cite.rel,
      abs,
      ok: false,
      missingNeedles: cite.needles,
      error: { code: "PIN_MISSING", message: `missing pin cite ${cite.rel}` },
    };
  }
  const text = readFileSync(abs, "utf8");
  const missing = cite.needles.filter((needle) => !text.includes(needle));
  return {
    id: cite.id,
    rel: cite.rel,
    abs,
    ok: missing.length === 0,
    missingNeedles: missing,
    bytes: Buffer.byteLength(text),
  };
}

function hashArchiveRow({ id, rel, expectedSha, expectedBytes, version }) {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) {
    return {
      id,
      rel,
      abs,
      ok: false,
      version,
      missingNeedles: [expectedSha],
      error: { code: "PIN_MISSING", message: `missing archive ${rel}` },
    };
  }
  const buf = readFileSync(abs);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const missing = [];
  if (buf.length !== expectedBytes) missing.push(`bytes:${expectedBytes}`);
  if (sha256 !== expectedSha) missing.push(`sha256:${expectedSha}`);
  return {
    id,
    rel,
    abs,
    ok: missing.length === 0,
    version,
    bytes: buf.length,
    sha256,
    expectedBytes,
    expectedSha,
    missingNeedles: missing,
  };
}

function readJsonPin(rel, expected) {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) {
    return {
      id: `json:${rel}`,
      rel,
      abs,
      ok: false,
      missingNeedles: [expected.sha256],
      error: { code: "PIN_MISSING", message: `missing ${rel}` },
    };
  }
  const json = JSON.parse(readFileSync(abs, "utf8"));
  const missing = [];
  if (json.sha256 !== expected.sha256) missing.push("sha256");
  if (json.bytes !== expected.bytes) missing.push("bytes");
  const name = json.name || json.version;
  if (expected.rootName && name && name !== expected.rootName && json.version !== expected.version) {
    missing.push("name");
  }
  return {
    id: `json:${rel}`,
    rel,
    abs,
    ok: missing.length === 0,
    sha256: json.sha256,
    bytes: json.bytes,
    missingNeedles: missing,
  };
}

/**
 * Cold-read committed useful-jobs archives, kit pin, catalog, and obtain-archive.
 * Fail closed if a twin digest, sha256.json, or needle drifts.
 */
export function loadPins() {
  let kit;
  try {
    kit = readKitPin();
  } catch (error) {
    return {
      ok: false,
      principle: PRINCIPLE,
      boundary: { ...BOUNDARY },
      repoRoot: REPO_ROOT,
      current: EXPECTED_CURRENT,
      stale: {},
      total: 0,
      failed: 1,
      rows: [],
      error: { code: "PIN_MISSING", message: error.message },
    };
  }

  const scans = PIN_CITES.map((cite) => scanCite(cite));
  const archives = [];

  archives.push(
    hashArchiveRow({
      id: "archive-for-agents-current",
      rel: kit.archiveRel,
      expectedSha: kit.sha256,
      expectedBytes: kit.bytes,
      version: kit.version,
    }),
    hashArchiveRow({
      id: "archive-kit-current",
      rel: kit.kitArchiveRel,
      expectedSha: kit.sha256,
      expectedBytes: kit.bytes,
      version: kit.version,
    }),
  );

  for (const row of kit.immutable) {
    archives.push(
      hashArchiveRow({
        id: `archive-for-agents-${row.version}`,
        rel: row.archiveRel,
        expectedSha: row.sha256,
        expectedBytes: row.bytes,
        version: row.version,
      }),
      hashArchiveRow({
        id: `archive-kit-${row.version}`,
        rel: row.kitArchiveRel,
        expectedSha: row.sha256,
        expectedBytes: row.bytes,
        version: row.version,
      }),
    );
  }

  const jsonPins = [
    readJsonPin(`client/public/for-agents/useful-jobs/${kit.rootName}.sha256.json`, kit),
    readJsonPin(`client/public/kit/${kit.rootName}.sha256.json`, kit),
  ];
  for (const row of kit.immutable) {
    jsonPins.push(
      readJsonPin(`client/public/for-agents/useful-jobs/${row.rootName}.sha256.json`, row),
      readJsonPin(`client/public/kit/${row.rootName}.sha256.json`, row),
    );
  }

  const live = [];
  const kitMatchesExpected =
    kit.version === EXPECTED_CURRENT.version &&
    kit.sha256 === EXPECTED_CURRENT.sha256 &&
    kit.bytes === EXPECTED_CURRENT.bytes;
  live.push({
    id: "kit-matches-expected-current",
    rel: KIT_REL,
    ok: kitMatchesExpected,
    missingNeedles: kitMatchesExpected
      ? []
      : [`${EXPECTED_CURRENT.version}/${EXPECTED_CURRENT.sha256}`],
    current: {
      version: kit.version,
      sha256: kit.sha256,
      bytes: kit.bytes,
    },
  });

  try {
    const catalog = JSON.parse(readFileSync(join(REPO_ROOT, CATALOG_REL), "utf8"));
    const ok = catalog.version === kit.version && catalog.version === EXPECTED_CURRENT.version;
    live.push({
      id: "catalog-not-stale-version",
      rel: CATALOG_REL,
      ok,
      missingNeedles: ok ? [] : [EXPECTED_CURRENT.version],
      version: catalog.version,
    });
  } catch (error) {
    live.push({
      id: "catalog-not-stale-version",
      rel: CATALOG_REL,
      ok: false,
      missingNeedles: [EXPECTED_CURRENT.version],
      error: { code: "PIN_READ", message: error.message },
    });
  }

  try {
    const discovery = JSON.parse(readFileSync(join(REPO_ROOT, DISCOVERY_REL), "utf8"));
    const discSha = discovery.archive?.sha256 || discovery.sha256;
    const discBytes = discovery.archive?.bytes ?? discovery.bytes;
    const missing = [];
    if (discSha !== kit.sha256) missing.push("sha256");
    if (discBytes !== kit.bytes) missing.push("bytes");
    if (discovery.version && discovery.version !== kit.version) missing.push("version");
    live.push({
      id: "discovery-current-digest",
      rel: DISCOVERY_REL,
      ok: missing.length === 0,
      missingNeedles: missing,
    });
  } catch (error) {
    live.push({
      id: "discovery-current-digest",
      rel: DISCOVERY_REL,
      ok: false,
      missingNeedles: ["sha256"],
      error: { code: "PIN_READ", message: error.message },
    });
  }

  const negative = kit.immutable.find((row) => row.version === NEGATIVE_CONTROL_VERSION);
  live.push({
    id: "negative-control-110",
    rel: negative?.archiveRel || "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz",
    ok: Boolean(negative) && negative.sha256 !== kit.sha256 && negative.bytes !== kit.bytes,
    missingNeedles: negative ? [] : [NEGATIVE_CONTROL_VERSION],
    version: NEGATIVE_CONTROL_VERSION,
    sha256: negative?.sha256 || null,
    bytes: negative?.bytes || null,
  });

  const obtainAbs = join(REPO_ROOT, OBTAIN_ARCHIVE_REL);
  live.push({
    id: "obtain-archive-present",
    rel: OBTAIN_ARCHIVE_REL,
    abs: obtainAbs,
    ok: existsSync(obtainAbs),
    missingNeedles: existsSync(obtainAbs) ? [] : [OBTAIN_ARCHIVE_REL],
  });

  const rows = [...scans, ...archives, ...jsonPins, ...live];
  const failed = rows.filter((row) => !row.ok);
  return {
    ok: failed.length === 0,
    principle: PRINCIPLE,
    boundary: { ...BOUNDARY },
    repoRoot: REPO_ROOT,
    kit,
    current: {
      version: kit.version,
      sha256: kit.sha256,
      bytes: kit.bytes,
      rootName: kit.rootName,
      archiveRel: kit.archiveRel,
      kitArchiveRel: kit.kitArchiveRel,
    },
    stale: stalePinsFromKit(kit),
    negativeControl: negative || null,
    total: rows.length,
    failed: failed.length,
    rows,
    error: failed.length
      ? {
          code: failed.some((row) => row.error?.code === "PIN_MISSING")
            ? "PIN_MISSING"
            : "PIN_DRIFT",
          message: `${failed.length} SDS archive pin(s) missing or drifted`,
          failed: failed.map((row) => ({
            id: row.id,
            rel: row.rel,
            missingNeedles: row.missingNeedles,
            error: row.error || null,
          })),
        }
      : null,
  };
}



#!/usr/bin/env node
/**
 * Build a portable clean archive + SOURCE-MAP usable later in Neomorphic.
 * Resolves Heavy/Cap sources from vendored roots (unpacked kit) or repository siblings.
 * Copies kit + Cap01/04/05/07/08 + s138 into a staging tree with relative imports only.
 * No live publication/payment/deploy.
 */
import {
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  EXAMPLES_TIP,
  FIRST_RUN_TIP,
  HEAVY_PIN,
  JOURNEY_TIP,
  KIT_BRANCH,
} from "../src/constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = join(__dirname, "..");

const CAP_PACKAGES = [
  "01",
  "04",
  "05",
  "07",
  "08",
  "first-run-s172",
  "journey-s162",
  "examples-s170",
];

const REPLACEMENTS = [
  [
    "../../../vendor/s138-capability-evidence/src/index.mjs",
    "../../vendor/s138-capability-evidence/src/index.mjs",
  ],
  [
    "../vendor/s138-capability-evidence/src/index.mjs",
    "../vendor/s138-capability-evidence/src/index.mjs",
  ],
  [
    "../vendor/capabilities/01/src/index.mjs",
    "../vendor/capabilities/01/src/index.mjs",
  ],
  [
    "../vendor/capabilities/04/src/index.mjs",
    "../vendor/capabilities/04/src/index.mjs",
  ],
  [
    "../vendor/capabilities/05/src/index.mjs",
    "../vendor/capabilities/05/src/index.mjs",
  ],
  [
    "../vendor/capabilities/07/src/index.mjs",
    "../vendor/capabilities/07/src/index.mjs",
  ],
  [
    "../vendor/capabilities/08/src/index.mjs",
    "../vendor/capabilities/08/src/index.mjs",
  ],
  [
    "../vendor/capabilities/first-run-s172/src/index.mjs",
    "../vendor/capabilities/first-run-s172/src/index.mjs",
  ],
  [
    "../vendor/capabilities/journey-s162/src/index.mjs",
    "../vendor/capabilities/journey-s162/src/index.mjs",
  ],
  [
    "../vendor/capabilities/examples-s170/src/index.mjs",
    "../vendor/capabilities/examples-s170/src/index.mjs",
  ],
];

export function resolveCapabilityRoots(kitRoot = KIT_ROOT) {
  const vendorHeavy = join(kitRoot, "vendor/s138-capability-evidence");
  const vendorCaps = join(kitRoot, "vendor/capabilities");
  const repoHeavy = join(kitRoot, "..", "s138-capability-evidence");
  const repoCaps = join(kitRoot, "..", "scale-r2-20260910", "capabilities");
  const vendored =
    existsSync(join(vendorHeavy, "src/index.mjs")) &&
    existsSync(join(vendorCaps, "01/src/index.mjs"));
  if (vendored) {
    return { layout: "vendored", heavy: vendorHeavy, capsRoot: vendorCaps };
  }
  const repository =
    existsSync(join(repoHeavy, "src/index.mjs")) &&
    existsSync(join(repoCaps, "01/src/index.mjs"));
  if (repository) {
    return { layout: "repository", heavy: repoHeavy, capsRoot: repoCaps };
  }
  return {
    layout: "missing",
    heavy: null,
    capsRoot: null,
    error:
      "neither vendored (vendor/s138-capability-evidence) nor repository sibling sources resolved",
  };
}

function kitSourceRevision(kitRoot = KIT_ROOT) {
  const git = spawnSync("git", ["-C", kitRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (git.status === 0 && git.stdout.trim()) return git.stdout.trim();
  const parent = spawnSync("git", ["-C", join(kitRoot, "..", ".."), "rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  if (parent.status === 0 && parent.stdout.trim()) return parent.stdout.trim();
  return null;
}

function buildSourceMap({ layout, revision }) {
  return {
    schema: "pilot.r2.capabilities.source_map_s180.v1",
    kitBranch: KIT_BRANCH,
    heavyPin: HEAVY_PIN,
    kitSourceRevision: revision,
    layout,
    tips: {
      s164: HEAVY_PIN,
      firstRun: FIRST_RUN_TIP,
      examples: EXAMPLES_TIP,
      journey: JOURNEY_TIP,
    },
    mapping: [
      {
        kitPath: "vendor/s138-capability-evidence",
        upstream: "experiments/s138-capability-evidence",
        tip: HEAVY_PIN,
        caps: ["02", "03", "06"],
      },
      {
        kitPath: "vendor/capabilities/01",
        upstream: "experiments/scale-r2-20260910/capabilities/01",
        tip: FIRST_RUN_TIP,
        caps: ["01"],
      },
      {
        kitPath: "vendor/capabilities/04",
        upstream: "experiments/scale-r2-20260910/capabilities/04",
        tip: FIRST_RUN_TIP,
        caps: ["04"],
      },
      {
        kitPath: "vendor/capabilities/05",
        upstream: "experiments/scale-r2-20260910/capabilities/05",
        tip: FIRST_RUN_TIP,
        caps: ["05"],
      },
      {
        kitPath: "vendor/capabilities/07",
        upstream: "experiments/scale-r2-20260910/capabilities/07",
        tip: FIRST_RUN_TIP,
        caps: ["07"],
      },
      {
        kitPath: "vendor/capabilities/08",
        upstream: "experiments/scale-r2-20260910/capabilities/08",
        tip: FIRST_RUN_TIP,
        caps: ["08"],
      },
      {
        kitPath: "vendor/capabilities/first-run-s172",
        upstream: "experiments/scale-r2-20260910/capabilities/first-run-s172",
        tip: FIRST_RUN_TIP,
      },
      {
        kitPath: "vendor/capabilities/journey-s162",
        upstream: "experiments/scale-r2-20260910/capabilities/journey-s162",
        tip: JOURNEY_TIP,
      },
      {
        kitPath: "vendor/capabilities/examples-s170",
        upstream: "experiments/scale-r2-20260910/capabilities/examples-s170",
        tip: EXAMPLES_TIP,
      },
    ],
    importRelocation: REPLACEMENTS.map(([from, to]) => ({ from, to })),
    notes: [
      "Archive is offline/dry-run only. No payment, publish, or deploy.",
      "After unpack, run: node bin/capability-consumer-kit.mjs cold-start --probe",
      "Consumer suite: node --test --test-concurrency=1 tests/*.test.mjs",
      "Repository packing tests (tests/pack-repository.test.mjs) are not shipped in the archive.",
      "Imports inside the archive are rewritten to vendor/* relative paths (documented importRelocation).",
    ],
  };
}

function copyTree(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (p) => {
      const base = p.split("/").pop();
      if (base === "node_modules" || base === ".git") return false;
      if (base === "cells" && p.includes("s138-capability-evidence")) return false;
      if (base === "portable-out") return false;
      if (base === "pack-repository.test.mjs") return false;
      return true;
    },
  });
}

export function fileRole(p, root) {
  const underVendorCaps = p.includes("/vendor/capabilities/");
  const underKitSrc =
    (p.includes(`${join(root, "src")}/`) ||
      p.includes(`${join(root, "bin")}/`) ||
      p.includes(`${join(root, "tests")}/`) ||
      p.includes(`${join(root, "scripts")}/`)) &&
    !underVendorCaps;
  if (underVendorCaps) return "vendorCaps";
  if (underKitSrc || p.endsWith(`${root}/package.json`) || p.includes(`${root}/README`)) {
    return "kitSrc";
  }
  return "other";
}

export function rewriteText(text, role) {
  let out = text;
  if (role === "vendorCaps") {
    const from = "../../../vendor/s138-capability-evidence/src/index.mjs";
    const to = "../../vendor/s138-capability-evidence/src/index.mjs";
    return out.split(from).join(to);
  }
  if (role === "kitSrc") {
    for (const [from, to] of REPLACEMENTS) {
      if (from.startsWith("../../../../")) continue;
      out = out.split(from).join(to);
    }
    return out;
  }
  const PH = "__S180_HEAVY_IMPORT__";
  if (out.includes("../../../vendor/s138-capability-evidence/src/index.mjs")) {
    out = out.split("../../../vendor/s138-capability-evidence/src/index.mjs").join(PH);
  }
  for (const [from, to] of REPLACEMENTS) {
    if (from.startsWith("../../../../")) continue;
    out = out.split(from).join(to);
  }
  if (out.includes(PH)) {
    out = out.split(PH).join("../../vendor/s138-capability-evidence/src/index.mjs");
  }
  return out;
}

function rewriteImports(root) {
  const walkSync = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === "cells" || name === "portable-out") continue;
        walkSync(p);
        continue;
      }
      if (!/\.(mjs|js|md|json)$/.test(name)) continue;
      const text = readFileSync(p, "utf8");
      const next = rewriteText(text, fileRole(p, root));
      if (next !== text) writeFileSync(p, next);
    }
  };
  walkSync(root);
}

function listRelFiles(dir, acc = [], prefix = "") {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "cells" || name === "portable-out") continue;
      listRelFiles(p, acc, rel);
    } else if (/\.(mjs|js|md|json)$/.test(name)) {
      acc.push(rel);
    }
  }
  return acc;
}

function compareStagedWithFrozen({ root, roots }) {
  const mismatches = [];
  const compared = [];
  const pairs = [
    {
      original: roots.heavy,
      staged: join(root, "vendor/s138-capability-evidence"),
    },
    ...CAP_PACKAGES.map((cap) => ({
      original: join(roots.capsRoot, cap),
      staged: join(root, "vendor/capabilities", cap),
    })),
  ];
  for (const { original, staged } of pairs) {
    const rels = listRelFiles(original);
    for (const rel of rels) {
      const origPath = join(original, rel);
      const stagedPath = join(staged, rel);
      if (!existsSync(stagedPath)) {
        mismatches.push({ file: rel, reason: "staged_missing" });
        continue;
      }
      const origText = readFileSync(origPath, "utf8");
      const stagedText = readFileSync(stagedPath, "utf8");
      const expected = rewriteText(origText, fileRole(stagedPath, root));
      compared.push(rel);
      if (stagedText !== expected) {
        mismatches.push({
          file: rel,
          reason: "bytes_differ_beyond_documented_import_relocation",
        });
      }
    }
  }
  return {
    ok: mismatches.length === 0,
    compared: compared.length,
    mismatches: mismatches.slice(0, 20),
    allowedRelocations: REPLACEMENTS.map(([from, to]) => ({ from, to })),
  };
}

export async function packPortableArchive(opts = {}) {
  const kitRoot = opts.kitRoot || KIT_ROOT;
  const out = opts.out || join(kitRoot, "portable-out/s180-capability-consumer-kit.tgz");
  const roots = resolveCapabilityRoots(kitRoot);
  if (roots.layout === "missing") {
    return {
      ok: false,
      error: roots.error,
      out: relative(kitRoot, out),
      layout: "missing",
    };
  }

  mkdirSync(dirname(out), { recursive: true });
  const staging = mkdtempSync(join(tmpdir(), "s180-pack-"));
  const root = join(staging, "s180-capability-consumer-kit");
  const revision = kitSourceRevision(kitRoot);
  const sourceMap = buildSourceMap({ layout: roots.layout, revision });

  try {
    mkdirSync(root, { recursive: true });
    for (const name of ["src", "bin", "fixtures", "tests", "scripts", "package.json", "README.md"]) {
      const src = join(kitRoot, name);
      if (existsSync(src)) copyTree(src, join(root, name));
    }
    writeFileSync(join(root, "SOURCE-MAP.json"), `${JSON.stringify(sourceMap, null, 2)}\n`);
    if (roots.layout === "repository") {
      writeFileSync(join(kitRoot, "SOURCE-MAP.json"), `${JSON.stringify(sourceMap, null, 2)}\n`);
    }

    copyTree(roots.heavy, join(root, "vendor/s138-capability-evidence"));
    for (const cap of CAP_PACKAGES) {
      copyTree(join(roots.capsRoot, cap), join(root, "vendor/capabilities", cap));
    }

    rewriteImports(root);
    const parity = compareStagedWithFrozen({ root, roots });

    writeFileSync(
      join(root, "README.PORTABLE.md"),
      `# S180 portable capability-consumer kit

Heavy pin: \`${HEAVY_PIN}\`
Kit source revision: \`${revision || "unknown"}\`
Layout packed from: \`${roots.layout}\`

\`\`\`sh
tar -xzf s180-capability-consumer-kit.tgz
cd s180-capability-consumer-kit
node bin/capability-consumer-kit.mjs status
node bin/capability-consumer-kit.mjs cold-start --probe
node --test --test-concurrency=1 tests/*.test.mjs
\`\`\`

The shipped consumer suite does not include repository packing tests
(\`tests/pack-repository.test.mjs\`). Pack from an unpacked tree uses
\`vendor/*\` roots. See SOURCE-MAP.json for upstream tips and documented
import relocation. Offline/dry-run only.
`,
    );

    const tar = spawnSync(
      "tar",
      ["-czf", out, "-C", staging, "s180-capability-consumer-kit"],
      { encoding: "utf8" },
    );
    if (tar.status !== 0) {
      return {
        ok: false,
        error: tar.stderr || tar.stdout || "tar failed",
        out: relative(kitRoot, out),
        layout: roots.layout,
        parity,
      };
    }

    const archiveSha256 = createHash("sha256").update(readFileSync(out)).digest("hex");
    const relOut = out.includes("experiments/")
      ? out.slice(out.indexOf("experiments/"))
      : relative(process.cwd(), out);

    return {
      ok: true,
      out: relOut,
      archiveSha256,
      kitSourceRevision: revision,
      layout: roots.layout,
      parity,
      sourceMap: "SOURCE-MAP.json",
      heavyPin: HEAVY_PIN,
      readyForRelease: false,
      livePublication: false,
      payment: false,
      deploy: false,
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const invokedAsCli =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  const result = await packPortableArchive({
    out: process.argv[2] || join(KIT_ROOT, "portable-out/s180-capability-consumer-kit.tgz"),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

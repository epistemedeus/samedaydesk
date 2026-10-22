#!/usr/bin/env node
import { checkFeatureMap, defaultRepoRoot, FEATURES_DIR, resolveSeed } from "./lib.mjs";

function parseArgs(argv) {
  const out = {
    json: false,
    seed: null,
    map: null,
    repo: null,
    catalog: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--seed") out.seed = argv[++i];
    else if (arg === "--map") out.map = argv[++i];
    else if (arg === "--repo") out.repo = argv[++i];
    else if (arg === "--catalog") out.catalog = argv[++i];
    else {
      const err = new Error(`unknown argument: ${arg}`);
      err.code = "usage";
      throw err;
    }
  }
  return out;
}

function helpText() {
  return `check-map — SDS feature-map coverage for useful-jobs / packs / MCP

Usage:
  node tools/verify-sds/features/check-map.mjs [--json]
  node tools/verify-sds/features/check-map.mjs --seed missing-surface [--json]

Options:
  --json              JSON on stdout (always emitted; this flag is accepted)
  --seed NAME         Use a seeded map. Required name: missing-surface
  --map DIR           Alternate markdown map directory
  --repo DIR          Repo root for on-disk probes
  --catalog FILE      Alternate catalog.json
  --help              This text

Live map must document every catalog id in useful-jobs, packs, and mcp.
--seed missing-surface points at fixtures/seeded-missing-surface, which omits
MCP. That run must exit 1 with error.code SEED_REJECT and productCode
missing_surface.
`;
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code: "usage", message: err.message } }, null, 2)}\n`);
    process.exit(2);
  }

  if (args.help) {
    process.stderr.write(helpText());
    process.stdout.write(
      `${JSON.stringify({ ok: true, help: true, schema: "samedaydesk.verify-sds.feature-map.v1" }, null, 2)}\n`,
    );
    process.exit(0);
  }

  let seed = args.seed || null;
  let mapDir = args.map || FEATURES_DIR;
  try {
    if (seed) {
      const resolved = resolveSeed(seed);
      seed = resolved.seed;
      if (!args.map) mapDir = resolved.mapDir;
    }
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: { code: err.code || "unknown_seed", message: err.message } }, null, 2)}\n`,
    );
    process.exit(2);
  }

  const result = checkFeatureMap({
    repoRoot: args.repo || defaultRepoRoot(),
    mapDir,
    catalogPath: args.catalog || undefined,
    seed,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    const surface = result.error?.surface || result.missing[0] || "unknown";
    const line = result.seed
      ? `SEED_REJECT missing_surface ${surface}`
      : `missing_surface flagged: ${surface}`;
    process.stderr.write(`${line}\n`);
    process.exit(1);
  }
  process.stderr.write(
    `feature-map ok families=${result.requiredFamilies.join(",")} documented=${result.documentedCount}/${result.requiredCount}\n`,
  );
  process.exit(0);
}

main();

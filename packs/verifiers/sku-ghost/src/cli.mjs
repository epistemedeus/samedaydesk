import { resolve } from "node:path";
import { fail } from "./failures.mjs";
import { verifySkuGhost } from "./verify.mjs";
import { findRepoRoot } from "./paths.mjs";

export const USAGE = `Usage:
  node packs/verifiers/sku-ghost/bin/sku-ghost.mjs --committed
  node packs/verifiers/sku-ghost/bin/sku-ghost.mjs --fixture <path>

Offline SKU-ghost oracle. Advertised offer slugs must exist in
server/pricing.js. Records live prices; never rewrites SKUs.
Never calls checkout. Never publishes.

Exit 0: no ghosts. Exit 2: explicit failure JSON on stdout.
`;

export function parseArgs(argv) {
  const args = {
    mode: "committed",
    fixturePath: null,
    pretty: true,
    flags: {},
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--committed") args.mode = "committed";
    else if (a === "--fixture") {
      args.mode = "fixture";
      args.fixturePath = argv[++i];
    } else if (a === "--compact") args.pretty = false;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--publish" || a === "--deploy" || a === "--write-sds") {
      args.flags.publish = true;
    } else if (a === "--checkout" || a === "--pay" || a === "--payment") {
      args.flags.checkout = true;
    } else if (a === "--edit-prices" || a === "--edit-skus") {
      args.flags.editPrices = true;
    } else {
      return { error: fail("usage", `unknown argument: ${a}`) };
    }
  }
  if (args.mode === "fixture" && !args.fixturePath) {
    return { error: fail("usage", "--fixture requires a path") };
  }
  if (args.fixturePath) args.fixturePath = resolve(process.cwd(), args.fixturePath);
  return { args };
}

export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    stdout.write(`${JSON.stringify(parsed.error, null, 2)}\n`);
    return 2;
  }
  if (parsed.args.help) {
    stderr.write(USAGE);
    return 0;
  }
  const result = await verifySkuGhost({
    mode: parsed.args.mode,
    fixturePath: parsed.args.fixturePath,
    repoRoot: findRepoRoot(),
    flags: parsed.args.flags,
  });
  const indent = parsed.args.pretty ? 2 : 0;
  stdout.write(`${JSON.stringify(result, null, indent)}\n`);
  return result.ok === true && Array.isArray(result.ghosts) && result.ghosts.length === 0 ? 0 : 2;
}

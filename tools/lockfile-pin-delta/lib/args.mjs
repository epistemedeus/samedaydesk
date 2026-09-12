export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) {
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

export function usage() {
  return `lockfile-delta - bounded offline npm package-lock pin delta (Node >= 22)

Compare two package-lock.json files (lockfileVersion 2 or 3) and emit
pin-delta.json plus pin-delta.md of added, removed, and changed
name+version+integrity+resolved pins and npm install boundaries
(link, optional, devOptional, os, cpu, libc). Unchanged packages are
omitted. An injected hasher cannot hide a semantic difference or invent one.

  node bin/lockfile-delta.mjs --before <lock> --after <lock> [--out-dir <dir>]
  node bin/lockfile-delta.mjs --example [--out-dir <dir>]

Does not run npm, does not call the registry, and never authorizes purchase.
HTML, package.json-only, pnpm, and Yarn inputs refuse with distinct codes.
Duplicate JSON members and resource-limit violations refuse before analysis.
A SAMPLE lock presented as a customer delta refuses. Missing applicable
integrity is labelled partial, not a sale.
`;
}

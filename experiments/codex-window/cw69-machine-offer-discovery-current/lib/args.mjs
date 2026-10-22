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
  return `cw69 offer — lockfile-pin-delta discover / describe / invoke

Commands:
  discover --job-id lockfile-pin-delta --out <file> [--live-rebind]
  describe --discovery <file> --before <lock> --after <lock> --out <file>
           [--method local-cli] [--acquisition offline-local-run]
  invoke   --description <file> --before <lock> --after <lock> --out-dir <dir>
           [--method local-cli] [--acquisition offline-local-run]

Offline local CLI only. Does not pay, settle, or treat merchant examples as execution.
GET on the published POST-only route is refused. Paid HTTP is not this adapter.
`;
}

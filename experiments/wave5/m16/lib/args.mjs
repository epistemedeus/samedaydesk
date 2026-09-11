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
  return `w5-m16-trial — reproducible dependency-update real-project trial

Invokes the pinned lockfile-pin-delta CLI (W5-M03 / W4-commerce-11) on two
lockfile revisions, then joins packages[id].resolved from the staged bytes.
Does not vendor the engine, run npm, audit, purchase, or rewrite the catalog.

  node bin/trial.mjs run --journey sds-vuln-update [--out-dir <dir>]
  node bin/trial.mjs run --before-ref <sha> --after-ref <sha> [--lock-path package-lock.json]
  node bin/trial.mjs run --before <file> --after <file> [--out-dir <dir>]
  node bin/trial.mjs run --before-url <url> --after-url <url> [--out-dir <dir>]
  node bin/trial.mjs catalog-binding
  node bin/trial.mjs help

Exit 0: transport succeeded and analysis is actionable, no-change, or partial.
Exit 2: valid refusal (HTML, SAMPLE-as-customer, missing inputs).
Exit 1: transport/engine failure (missing CLI, crash, non-JSON).

--example is not a real-project trial. Field execution is not performed here.
`;
}

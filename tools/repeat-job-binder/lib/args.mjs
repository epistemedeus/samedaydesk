export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
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

export function helpText() {
  return `repeat-job-binder - execute a verified next-run against changed local inputs

Usage:
  node bin/bind.mjs --ticket <repeat-job.json|next-run.json> \\
    --before <file> --after <file> [--used <file>] \\
    --declare-after-sha256 <64-hex> \\
    [--engine catalog|vendor-pin] [--out-dir <dir>]

  Given a verified repeat-job.json (or a next-run manifest the engine accepts)
  plus new local input files, bind the declared family, run the matching
  useful-jobs catalog CLI or vendor-pin record-repeat, and emit a second-run
  record. Not a scheduler daemon. Never cron install.

Required:
  --ticket        repeat-job.json envelope or s176/s163 next-run manifest

Changed-input declaration:
  --after                 new after file (required for a verified second use)
  --declare-after-sha256  sha256 of that after file (64 hex; sha256: prefix ok)
  --before --used         optional overrides; --declare-before-sha256 / --declare-used-sha256
  --input-root            resolve relative ticket paths against this directory

Engine:
  --engine catalog        published useful-jobs CLI (default)
  --engine vendor-pin     extracted record-repeat-job family CLI
  --useful-jobs-root      injected catalog root (otherwise extract pinned archive)
  --record-repeat-bin     injected vendor-pin CLI (otherwise extract pinned kit)

Honesty:
  --live-recurrence       claim live recurrence; SAMPLE-labelled tickets refuse
  Missing local files stay informational (not verified identity).
  Digest mismatch refuses. schedulerDaemon true refuses. Cron flags refuse.

Outputs (under --out-dir, default out/repeat-job-binder/run-*):
  second-run.json
  second-run.md
  engine/   catalog or vendor-pin artifacts

Node >= 22. Offline after the pinned PR51 archives are present in this repo.
Payments are nonsettling prototypes; this binder has no pay path.
`;
}

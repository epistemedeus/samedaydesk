# Tutorial: first offline useful job

This is a lesson. Follow it in order. Do not skip the size and digest check.
Do not pay. Do not call `/extract/batch`.

Goal: acquire useful-jobs **1.4.7**, list the ten jobs, and finish one labeled
sample (`lockfile-pin-delta --example`) so you have seen a real `"ok": true`
from the CLI.

## What you need

- Node.js 22.x
- `bash`, `curl`, `python3`, `tar`, `mktemp`
- Network only for the download. After extract, the CLI is offline.

If you already have this repository, the follow-the-doc runner in
[README.md](README.md) serves the committed tarball on loopback so the same
recipe works without the public origin.

## 1. Acquire, verify, extract

Stdout of this block is **only** the kit directory. `list` goes to stderr.
If HTTP status, byte count, or SHA-256 is wrong, the function returns
non-zero and does not extract.

<!-- follow-the-doc:step id=acquire -->
```bash
useful_jobs_acquire() {
  local origin="${USEFUL_JOBS_ORIGIN:-${1:-https://samedaydesk.com}}"
  local bytes=5255824
  local sha=e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec
  local work tgz root
  work=$(mktemp -d "${TMPDIR:-/tmp}/useful-jobs.XXXXXX") || return 1
  tgz="$work/useful-jobs-1.4.7.tar.gz"
  root="$work/useful-jobs-1.4.7"
  curl -fsSL --max-time 60 -o "$tgz" "$origin/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz" || { rm -rf "$work"; return 1; }
  python3 -c 'import hashlib,pathlib,sys; p=pathlib.Path(sys.argv[1]); b=p.read_bytes(); n=len(b); e=int(sys.argv[2]); (n==e) or sys.exit((sys.stderr.write("size %s != %s\n" % (n, e)) or 1)); h=hashlib.sha256(b).hexdigest(); (h==sys.argv[3]) or sys.exit((sys.stderr.write("sha256 %s != %s\n" % (h, sys.argv[3])) or 1))' "$tgz" "$bytes" "$sha" || { rm -rf "$work"; return 1; }
  tar -xzf "$tgz" -C "$work" || { rm -rf "$work"; return 1; }
  [ -f "$root/bin/useful-jobs.mjs" ] || { rm -rf "$work"; return 1; }
  (cd "$root" && node bin/useful-jobs.mjs list >&2) || { rm -rf "$work"; return 1; }
  printf '%s\n' "$root"
  return 0
}
kit=$(useful_jobs_acquire) || exit 1
printf '%s\n' "$kit"
```

You should now have `$kit` pointing at a directory that contains
`bin/useful-jobs.mjs`.

## 2. Look around

<!-- follow-the-doc:step id=list-help -->
```bash
node "$kit/bin/useful-jobs.mjs" list
node "$kit/bin/useful-jobs.mjs" help
node "$kit/bin/useful-jobs.mjs" help lockfile-pin-delta
```

`list` names ten jobs, starting with `lockfile-pin-delta`. `help` describes
the router. Job help names `--before` and `--after` for the lockfile job.

## 3. Run one labeled sample

`--example` loads the kit's labeled sample. It is not your customer's
lockfile. Nine jobs accept `--example`. `page-change-offline-job` refuses it.

<!-- follow-the-doc:step id=example-lockfile -->
```bash
node "$kit/bin/useful-jobs.mjs" run lockfile-pin-delta --example
```

Expect exit 0 and JSON that includes `"ok": true`. That means the runner
finished honestly on the labeled sample. It is not a claim that a live
repository changed.

## What you can do next

- Run the same job on files you hold: [how-to.md](how-to.md)
- Look up flags and refusal codes: [reference.md](reference.md)
- Read why verify-before-extract exists: [explanation.md](explanation.md)

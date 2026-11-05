useful_jobs_acquire() {
  local origin="${USEFUL_JOBS_ORIGIN:-${1:-https://samedaydesk.com}}"
  local bytes=2575215
  local sha=2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f
  local work tgz root
  work=$(mktemp -d "${TMPDIR:-/tmp}/useful-jobs.XXXXXX") || return 1
  tgz="$work/useful-jobs-1.4.0.tar.gz"
  root="$work/useful-jobs-1.4.0"
  curl -fsSL --max-time 60 -o "$tgz" "$origin/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz" || { rm -rf "$work"; return 1; }
  python3 -c 'import hashlib,pathlib,sys; p=pathlib.Path(sys.argv[1]); b=p.read_bytes(); n=len(b); e=int(sys.argv[2]); (n==e) or sys.exit((sys.stderr.write("size %s != %s\n" % (n, e)) or 1)); h=hashlib.sha256(b).hexdigest(); (h==sys.argv[3]) or sys.exit((sys.stderr.write("sha256 %s != %s\n" % (h, sys.argv[3])) or 1))' "$tgz" "$bytes" "$sha" || { rm -rf "$work"; return 1; }
  tar -xzf "$tgz" -C "$work" || { rm -rf "$work"; return 1; }
  [ -f "$root/bin/useful-jobs.mjs" ] || { rm -rf "$work"; return 1; }
  (cd "$root" && node bin/useful-jobs.mjs list >&2) || { rm -rf "$work"; return 1; }
  printf '%s\n' "$root"
  return 0
}
kit=$(useful_jobs_acquire) || exit 1
printf '%s\n' "$kit"

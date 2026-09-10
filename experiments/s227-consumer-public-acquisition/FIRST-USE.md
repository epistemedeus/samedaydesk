# First use — public consumer evidence package

Offline only. Node.js 22. No repository checkout. No `npm install`. No paid or network job execution. Do not rebuild the archive.

Archive: `https://samedaydesk.com/kit/s178-consumer-repeat-kit.tgz`
Bytes: `718948`
SHA-256: `04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d`

If HTTP status, size, or digest is wrong, the cold-start function returns non-zero and does not extract or run the CLI. Each run uses a fresh temp directory. Keep caller files under `$PWD` so paths stay clear after the function returns.

## Cold start (exact public command)

```bash
s178_consumer_repeat_acquire() {
  local origin="${S178_CONSUMER_REPEAT_ORIGIN:-${1:-https://samedaydesk.com}}"
  local bytes=718948
  local sha=04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d
  local work tgz root
  work=$(mktemp -d "${TMPDIR:-/tmp}/s178-consumer-repeat.XXXXXX") || return 1
  tgz="$work/s178-consumer-repeat-kit.tgz"
  root="$work/s178-consumer-repeat-kit"
  curl -fsSL --max-time 60 -o "$tgz" "$origin/kit/s178-consumer-repeat-kit.tgz" || { rm -rf "$work"; return 1; }
  python3 -c 'import hashlib,pathlib,sys; p=pathlib.Path(sys.argv[1]); b=p.read_bytes(); assert len(b)==int(sys.argv[2]), len(b); h=hashlib.sha256(b).hexdigest(); assert h==sys.argv[3], h' "$tgz" "$bytes" "$sha" || { rm -rf "$work"; return 1; }
  tar -xzf "$tgz" -C "$work" || { rm -rf "$work"; return 1; }
  [ -f "$root/bin/s178-cli.mjs" ] || { rm -rf "$work"; return 1; }
  (cd "$root" && node bin/s178-cli.mjs list) || { rm -rf "$work"; return 1; }
  printf '%s\n' "$root"
  return 0
}
kit=$(s178_consumer_repeat_acquire) || exit 1
printf '%s\n' "$kit"
```

The command prints the extracted kit path and stores it in `kit`. Later commands use `"$kit/..."` and `"$PWD/..."`.

## Labeled samples (not caller files)

```bash
node "$kit/bin/s178-cli.mjs" list
node "$kit/bin/s178-cli.mjs" example release-brief --kind conflict
node "$kit/bin/s178-cli.mjs" run 07 --clock 2026-09-10T18:00:00.000Z
node "$kit/bin/s178-cli.mjs" run release-brief --clock 2026-09-10T18:00:00.000Z
```

`--clock` is required (operator ISO-8601). Do not invent time.

## Caller files

```bash
node "$kit/bin/s178-cli.mjs" run 07 --in "$PWD/caller-a.json" --clock 2026-09-10T18:00:00.000Z
node "$kit/bin/s178-cli.mjs" run release-brief --in "$PWD/caller-b.json" --clock 2026-09-10T18:00:00.000Z
```

## Changed-input repeat

Write output to a **new** file. Re-run with a changed caller file. Do not overwrite the first caller file.

```bash
node "$kit/bin/s178-cli.mjs" run release-brief --in "$PWD/caller-partial.json" --clock 2026-09-10T18:00:00.000Z > "$PWD/repeat-note.json"
node "$kit/bin/s178-cli.mjs" run release-brief --in "$PWD/caller-reconciled.json" --clock 2026-09-10T18:00:00.000Z
```

## Decisions

`ok: true` means the runner completed honestly. It is not a pass claim. Local provenance files are integrity metadata, not an independent attestation. A local completion is not an actual customer delivery. Announced, shipped, and tested stay distinct.

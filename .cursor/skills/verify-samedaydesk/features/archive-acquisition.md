# archive-acquisition

Copy or download the public useful-jobs tarball, verify bytes+sha256, then extract. Mismatch must not write dest or extract.

| field | value |
| --- | --- |
| goal | bytes+sha then extract outside the repo |
| entrypoint | `experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs` |
| command | `archive acquire` / `archive negative-control` |
| state | 1.4.7 sha `e2e9b44e…69dec`, 5255824 bytes; 1.1.0 kept as negative |
| tests | s260 obtain refuses bad status/size/digest; `public-1.1.0-cold.test.mjs` |
| prerequisite | bash/curl/python3/tar/mktemp; Node 22 |

## Sub-features

- `acquire-147` copies kit/public 1.4.7, checks sha+bytes, extracts `bin/useful-jobs.mjs`.
- `negative-110` extracts 1.1.0 and lists; version is not 1.4.7.
- `wrong-digest` refuses before dest write. Child currently **exit 0** with `ok:false`.

## How to get to it (user POV)

- Discovery JSON `coldStart` on `/for-agents/useful-jobs`.
- Advertised consumer: sha256 the tarball, then `tar -xzf` into `/tmp`, then `node bin/useful-jobs.mjs list`.

## Driving it with verify-cli

Preconditions:

- Kit files present (doctor checks the pin).

- **Happy path.** `node tools/verify/cli.mjs archive acquire --json`. Exit 0. `result.outsideRepo` true. `result.bytes` 5255824. Then list.
- **Negative control.** `node tools/verify/cli.mjs archive negative-control --json`. Exit 0. Version 1.1.0.
- **Seeded SHA mismatch.** `node tools/verify/cli.mjs --seeded-failure sha-mismatch --json`. Exit **1**. `result.childExit` is **0**, `productCode` `wrong-digest`, remapped.

## Gotchas

- Do not copy obtain-archive `process.exit(0)` on refuse into the verifier.
- Apex download 403 from this VM is `cdn_challenge`; use the committed public files as `--from`.
- Immutable archives 1.0.0–1.4.0 stay as negatives; 1.1.0 is the required control.

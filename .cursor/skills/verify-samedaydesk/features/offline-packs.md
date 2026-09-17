# offline-packs

Local OpenAPI/CSV/price/RSS compare (s176) and listing diagnosis (s185). Files on disk only. No fetch, charge, or schedule.

| field | value |
| --- | --- |
| goal | local compare and listing diagnosis |
| entrypoint | `experiments/s176-record-repeat-package/bin/record-repeat.mjs`, `experiments/s185-distribution-repair-package/bin/distribution-repair.mjs` |
| command | `pack run s176` / `pack run s185` |
| state | labeled samples; HTML/malformed return JSON `ok:false` |
| tests | each package `"test":"node --test test/*.test.mjs"` |
| prerequisite | Node 22; no network |

## Sub-features

- `s176-sample` `sample --all` walks the four families.
- `s176-html` pricing HTML is `unsupported-pricing-format` (child may exit 0).
- `s185-positive` `sample --positive`.
- `s185-malformed` `diagnose examples/malformed.json` is `forbidden_claim`.

## How to get to it (user POV)

- `/for-agents/record-repeat` and `/for-agents/distribution-repair`.
- Public kit tarballs under `/kit/`.

## Driving it with verify-cli

Preconditions: none beyond Node 22.

- **s176.** `node tools/verify/cli.mjs pack run s176 --json`.
- **s185.** `node tools/verify/cli.mjs pack run s185 --json`.
- Product `ok:false` with child exit 0 is **not** verifier success unless `--expect-product-reject`.

## Gotchas

- s176/s185 HTML/malformed return JSON `ok:false` **exit 0**. Wrap to nonzero when the verifier is fed that seed.
- Isolate `--out-dir` / temp dirs; do not write into the package tree.

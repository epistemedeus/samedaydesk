# S260 useful-jobs source review (independent)

## Current public download (1.2.0)

- Public archive: `useful-jobs-1.2.0.tar.gz` **2579117** bytes
- SHA256: `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb`
- Kit mirror `/kit/useful-jobs-1.2.0.tar.gz`
- Catalog lists ten jobs; lockfile-pin-delta first
- Overlay only: `apps/listing-repair-packet/` (incomplete capture stays partial for every provider; unsupported complete providers are refused). Nested vendor pins and the four engine sources are unchanged from 1.1.0.
- Previous 1.1.0 and 1.0.0 URLs remain byte-identical (below)
- H04 public inputs (pin `37dd4b42cf21dc2031715971971bb2426a7beb80`) are copied under `samples/`
- Pack: `server/paid-useful-jobs/scripts/build-useful-jobs-archive.mjs` extracts immutable 1.1.0 then overlays listing-repair
- Source / archive freeze: `e9759e14c0cb264cc926339a9deb0e3fee993215`
- Reviewed source remains `d2a0d0b2798e9a3951c43fe16dd64215207c3d9b` (engine review not re-run here; no invented Sol findings)
- Not a paid HTTP merchant route
- listing-repair overlay hashes: `cli.mjs` `4ccda94e10e857109377a99b52050b07ad177bb05e85ff24f0ed1d8b158ece56`; `listing-repair-boundary.mjs` `12010bf92ef4e2836f824ffa5d3291ee2fa0e61d6a526378c71472a23b6b275e`

## Immutable 1.1.0 pins (unchanged URLs)

- Public archive: `useful-jobs-1.1.0.tar.gz` **2577606** bytes
- SHA256: `de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534`
- Kit mirror `/kit/useful-jobs-1.1.0.tar.gz`

## Historical 1.0.0 pins (unchanged URLs)

## Pins replayed
- Pilot tip: `0e473974554de9bfdba90676b6d3d710c10a2671` (`codex/s254-useful-applications-package-20260910`)
- Archive freeze: `318130daaf19490e2f8af7c23131b42fe20e6cde`
- Tip vs freeze: only `RESULT.md` differs; release archive byte-identical
- Public archive: `useful-jobs-1.0.0.tar.gz` **2522418** bytes
- SHA256: `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`
- Rebuild: **not required** (freeze CLI sha256 matches each public archive app)

## Six CLI independent reads (freeze == archive)
| Job id | CLI sha256 |
|---|---|
| api-upgrade-brief | `6138c5a5aacbf2250db578b5447e89cb79a94a623a059c4c2d0fc7dcb4ff15d8` |
| vendor-budget-impact | `9a19cdd5ecfda9b574b88b3e3e4bcb872aaceda07378bba3d9d5d629a9ea32ee` |
| feed-agenda | `b0af046a93a1dbcc3f73352d2ce14181899ff2a09547a14d87845674471670ba` |
| evidence-ci-annotation | `2967732aaedf2d550d12533ce60802d680e3dbd44ab75e4d74adbd80327baaaa` |
| listing-repair-packet | `a5d5d5653f74b7dc3933836807093c864ec3286ee97c518960585c3b3480da28` |
| repeat-job-record | `f4e3c2bdf2f247c762fd6a7705122d6d40e326fdc9a7cbc044ffd179c584e33f` |

## Honesty notes (on page / discovery; not rebuild triggers)
- `feed-agenda` can retain SAMPLE wording in notes when sample feed titles are used as caller inputs
- `evidence-ci-annotation` outputs from caller packets stay unattested
- `repeat-job-record` is an operator document, not a daemon; optional `--input-root` for local byte checks
- Schema-valid caller input is not kit-produced authority
- Free local package is distinct from paid hosted extract on `/for-agents`

## Public allowlist
Published tarball is runtime / docs / samples / licenses / vendor-pins only. No receipts, prompts, or research packets.

## SDS surface owned by this branch
- Page `/for-agents/useful-jobs` + directory link from `/for-agents` only
- Discovery `/discovery/useful-jobs.json`, catalog + outcomes beside archive
- Kit mirror `/kit/useful-jobs-1.2.0.tar.gz` (previous `/kit/useful-jobs-1.1.0.tar.gz` and `/kit/useful-jobs-1.0.0.tar.gz` unchanged)
- Cold start stdout is sole kit path; list on stderr
- No homepage offer change; no deploy in this PR

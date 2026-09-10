# S124 result

Source: samedaydesk 7c57db4842e9bea6b4d8f45aff997fbe16aeca03. Product-only composition parent: current main 40da1745f73df5e66752ec761b9755921c35febd. The accompanying S124_MANIFEST.json identifies every product file and archive by path, bytes and SHA-256. No topic ancestry, logs, launcher, prompts or unrelated surfaces are imported.

Fixed Grexal UTF-8/octal/space/unsafe path handling, header/hunk count checks, supplied-empty input, bounded file reads and Git capture, option/criterion validation, immutable output directory and explicit omission marker. Fee output now includes exact rational micros and rejects inconsistent USD/micro units. Manifest exposes the implemented inputs and outputs. Binary payloads and source completeness remain unverified; structural pass never means apply, useful delivery, funding or acceptance. Tests and fixtures are self-contained.

Fixed Agensi Free first use: original SKILL.md, complete actual synthetic CLI demo, license/provenance, bounded offline comparison and deterministic allowlisted upload ZIP. Missing/symlink/oversized inputs and unsafe descriptor references fail. The report distinguishes added/modified/removed files and unverified revision labels. Free requires no payout setup; no upstream recipe bytes are bundled. Local descriptor validation is not official Agensi review. private:true remains an npm publish guard.

Executed natively on Linux: Node v24.19.0, npm 11.9.0, Python 3.12.14, Git 2.51.1. From exact fresh npm tarball extraction: Grexal 33/33 tests, Agensi 20/20, zero failures/skips. From the actual Agensi ZIP: 20/20 plus validate, provenance demo and byte-identical ZIP rebuild. These are repeated package gates, not 73 distinct tests. Both tarballs and every ZIP member match exported source bytes. `grexal@0.4.1 validate` passed on the clean Grexal extraction. The added local Git-index/tar replay verifies tracked runtime files; no provider upload occurred. Worker 24/15 tests and nine overlapping native cells are inherited, not additional execution by this reviewer.

Replay from each fresh package directory:
- Both: `npm test`.
- Grexal: `node bin/validate-manifest.mjs`; `node agent/pack_evidence.js --unifiedDiffFile fixtures/diff/simple.patch --buyerCriteriaFile fixtures/criteria/require-structural.json --stdout-only`; `node agent/pack_evidence.js --unifiedDiffFile fixtures/diff/simple.patch --outDir <fresh-directory>`; `node bin/fee-worksheet.mjs --micros 50000 66667 80000 100000`; `npx --yes grexal@0.4.1 validate` (executed through npm exec --ignore-scripts --yes --package=grexal@0.4.1 -- grexal validate).
- Agensi: `npm run validate`; `node bin/provenance.mjs --freeDir fixtures/free --paidDir fixtures/paid`; `npm run build:zip`. All executed, including the extracted ZIP rebuild. Output path must not exist.

First private/draft Grexal activation: from a fresh extraction, follow README's `git init .` and explicit `git add` preparation, then operator runs `npx --yes grexal@0.4.1 push` without --publish. The CLI's git-ls-files/tar pipeline can otherwise produce an empty archive outside Git. The shipped identity is name-only, not an agent ID. A draft is not a live private agent; visibility and any publication require separate provider readback. These account actions were NOT run. No price selected, spend or earnings claimed.

First Free Agensi activation: operator's existing creator session at https://www.agensi.io/dashboard/submit, Free, title Offline Package Provenance Check, releases/offline-package-provenance.zip, full prompt/output in DEMO.md. No submit CLI exists in this package. ZIP is below 50 MB and title below 60 characters. Form requirements and 24–48-hour review window are inherited from root's actual account observation; review outcome is unknown. Payout eligibility matters only for a separately chosen paid listing.

Exposure review: all nine committed S121 JSONL logs plus launcher output and completion files were inspected. They expose internal workspace paths, session IDs, model/tool/skill inventories and OAuth source metadata (apiKeySource=oauth, not a token). No credential values found in the performed token/key/header and assignment checks; this is not a guarantee against every possible secret format. Excluding these files here does not erase the already-public source topic/history. Only compact session identifiers are retained below.

Remaining gates: root Node22 replay; real Grexal draft build/SDK sandbox execution and private visibility readback; Agensi UI upload/review and any native model skill-consumer demonstration. No website/browser gate applies to this product-only delta. No deployment, paid invocation, listing, credentials, wallet, account or payment mutation was performed. Stop at reviewed branch export/readback.

Inherited S121 completion sessions (nine overlapping cells claimed by owner, not a capacity claim):
C1-diff-semantics: 01a08aaa-9fb2-73f0-ac7f-0dd2070ab73e
C2-truncated-evidence: 01a08aaa-9f7a-7ad0-b01f-9d1135aa6576
C3-rename-binary-nonewline: 01a08aaa-9f94-7e73-bbe1-1dbef388b58b
C4-malicious-oversized: 01a08aaa-9ff5-7f22-96b0-3370e5d33c06
C5-grexal-validate-runtime: 01a08aaa-9fce-7d01-989c-5008cba6c2ed
C6-fee-edge-units: 01a08aaa-9fa0-7b51-b8ba-4ca9f0fc2434
C7-artifact-archive-install: 01a08aaa-9fbf-7043-8b49-bcc7b0d6b306
C8-agensi-paid-vs-free: 01a08aaa-9fee-7270-be44-4898491f270f
C9-buyer-criterion-binding: 01a08aaa-9fec-70a2-a333-e34d291c6d63

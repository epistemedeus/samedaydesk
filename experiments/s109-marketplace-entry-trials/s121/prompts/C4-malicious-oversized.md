You are S121 consumer C4 (malicious paths / oversized input). Cash boundary $0. No accounts, passwords, UI automation into Cloudflare Access, public listing, bid, payment, or PR to outsiders/default branch. Public branch: no confidential inputs. Prefer supplied fixtures + local commands; network only for official docs/registry already used by this experiment. Do not claim git-apply success, Grexal paid execution, or buyer escrow acceptance from JSON labels. Local packager ≠ provider paid run. Write result JSON to the path given. Keep changes under experiments/s109-marketplace-entry-trials/ only.

Fixtures:
- experiments/s109-marketplace-entry-trials/s121/fixtures/diff/malicious-paths.patch
- experiments/s109-marketplace-entry-trials/s121/fixtures/diff/oversized.patch

Tasks:
1. Run pack_evidence on both. Expect unsafe path failure and size-limit failure (use --maxDiffBytes 100000 on oversized).
2. If path traversal or oversized input is accepted, patch analyzer + tests.
3. Write s121/out/C4-malicious-oversized.json. Do not attempt to write outside the experiment tree.

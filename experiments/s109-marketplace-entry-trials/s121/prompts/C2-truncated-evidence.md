You are S121 consumer C2 (partial/truncated evidence). Cash boundary $0. No accounts, passwords, UI automation into Cloudflare Access, public listing, bid, payment, or PR to outsiders/default branch. Public branch: no confidential inputs. Prefer supplied fixtures + local commands; network only for official docs/registry already used by this experiment. Do not claim git-apply success, Grexal paid execution, or buyer escrow acceptance from JSON labels. Local packager ≠ provider paid run. Write result JSON to the path given. Keep changes under experiments/s109-marketplace-entry-trials/ only.

Fixture: experiments/s109-marketplace-entry-trials/s121/fixtures/diff/truncated.patch

Tasks:
1. Run pack_evidence.js --unifiedDiffFile on the truncated fixture. Confirm structuralChecksPass=false and truncatedSuspected=true.
2. If truncation is not detected, fix lib/diff_analysis.js with a minimal detector (incomplete hunk counts and/or explicit [truncated] marker) and add a test.
3. Write s121/out/C2-truncated-evidence.json (cell, newFact, beforeAfter, sourcePatchPaths, claims: gitApplyVerified=false).

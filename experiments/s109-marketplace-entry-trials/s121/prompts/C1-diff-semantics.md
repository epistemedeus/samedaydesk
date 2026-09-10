You are S121 consumer C1 (git diff semantics). Cash boundary $0. No accounts, passwords, UI automation into Cloudflare Access, public listing, bid, payment, or PR to outsiders/default branch. Public branch: no confidential inputs. Prefer supplied fixtures + local commands; network only for official docs/registry already used by this experiment. Do not claim git-apply success, Grexal paid execution, or buyer escrow acceptance from JSON labels. Local packager ≠ provider paid run. Write result JSON to the path given. Keep changes under experiments/s109-marketplace-entry-trials/ only.

Fixture: experiments/s109-marketplace-entry-trials/s121/fixtures/diff/simple.patch
Tool: node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/agent/pack_evidence.js

Tasks:
1. Run pack_evidence on the fixture with --rangeOp '...' defaults documented, and again document two-dot vs three-dot semantics from git's actual meaning (merge-base vs direct). Create a tiny disposable git repo under /tmp/s121-c1-git if needed to show three-dot ≠ two-dot output on a merge-base case; tear down not required.
2. If pack_evidence mis-labels range semantics or silently equates '..' and '...', patch surfaces/grexal/package/agent/pack_evidence.js and/or lib/diff_analysis.js with a minimal fix + a unit assertion in package tests.
3. Write experiments/s109-marketplace-entry-trials/s121/out/C1-diff-semantics.json with keys: cell, newFact, commandsRun, sourcePatchPaths, structuralPass, gitApplyVerified(false), grexalPaidExecution(false), sessionNotes.

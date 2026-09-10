You are S121 consumer C9 (buyer-criterion binding). Cash boundary $0. No accounts, passwords, UI automation into Cloudflare Access, public listing, bid, payment, or PR to outsiders/default branch. Public branch: no confidential inputs. Prefer supplied fixtures + local commands; network only for official docs/registry already used by this experiment. Do not claim git-apply success, Grexal paid execution, or buyer escrow acceptance from JSON labels. Local packager ≠ provider paid run. Write result JSON to the path given. Keep changes under experiments/s109-marketplace-entry-trials/ only.

Fixtures: simple.patch + s121/fixtures/criteria/require-structural.json
Tool: pack_evidence.js --buyerCriteriaFile ...

Tasks:
1. Show a structurally valid artifact can still fail buyerCriteria when a noteOnly / human-review criterion is present — structuralChecksPass true does NOT imply buyerAcceptanceVerified true.
2. If the tool collapses these flags, patch pack_evidence.js / diff_analysis.js so buyerAcceptanceVerified stays false unless an explicit, documented binding says otherwise — and even then label it local binding, not escrow.
3. Write s121/out/C9-buyer-criterion-binding.json emphasizing: syntactically valid ≠ work accepted.

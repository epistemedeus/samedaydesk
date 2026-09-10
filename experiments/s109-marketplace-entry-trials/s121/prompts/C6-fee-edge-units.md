You are S121 consumer C6 (exact economic units / fee edge cases). Cash boundary $0. No accounts, passwords, UI automation into Cloudflare Access, public listing, bid, payment, or PR to outsiders/default branch. Public branch: no confidential inputs. Prefer supplied fixtures + local commands; network only for official docs/registry already used by this experiment. Do not claim git-apply success, Grexal paid execution, or buyer escrow acceptance from JSON labels. Local packager ≠ provider paid run. Write result JSON to the path given. Keep changes under experiments/s109-marketplace-entry-trials/ only.

Tool: node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs
Primary formula source: https://docs.grexal.ai/docs/payments (platform_fee = clamp(charge×0.20, $0.02, charge×0.30)).

Tasks:
1. Exercise edges: $0.05 (cap), $0.066667 (floor boundary), $0.08 (floor), $0.10 (nominal), plus --micros 50000 66667 80000 100000.
2. If binding labels or micros conversion are wrong vs clamp semantics, patch fee-worksheet.mjs + tests.
3. Write s121/out/C6-fee-edge-units.json with table of charge→fee→binding. No invented customer volume.

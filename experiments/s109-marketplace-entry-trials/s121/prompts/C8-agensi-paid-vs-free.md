You are S121 consumer C8 (Agensi paid-delivery vs free provenance). Cash boundary $0. No accounts, passwords, UI automation into Cloudflare Access, public listing, bid, payment, or PR to outsiders/default branch. Public branch: no confidential inputs. Prefer supplied fixtures + local commands; network only for official docs/registry already used by this experiment. Do not claim git-apply success, Grexal paid execution, or buyer escrow acceptance from JSON labels. Local packager ≠ provider paid run. Write result JSON to the path given. Keep changes under experiments/s109-marketplace-entry-trials/ only.

Official Agensi surface: https://www.agensi.io/auth , https://www.agensi.io/sell , https://mcp.agensi.io/mcp .
NOT an Agensi seller path: https://www.agensi.dev (Cloudflare Access) — do not enter that Access tenant.

Fixtures: s121/fixtures/agensi-free and s121/fixtures/agensi-paid
Tool: node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/provenance.mjs

Tasks:
1. Run provenance.mjs comparing free vs paid dirs. Confirm packaging delta files and claimsProprietaryOwnershipOfFreeRecipes=false.
2. Correct any remaining S109 guidance that treats agensi.dev Access as the seller entry (access-handoff.json / offer-descriptor.json / README).
3. Optional anonymous GET of www.agensi.io/sell and mcp initialize already known — do not authenticate, do not get_skill confirm=true.
4. Write s121/out/C8-agensi-paid-vs-free.md and .json with corrected known facts + listing description that only claims implemented packaging/provenance behavior.

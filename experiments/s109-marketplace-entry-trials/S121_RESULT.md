# S121 RESULT — market package consumers (concurrent)

Cash boundary: **$0**. No accounts, passwords, UI listing, bid, payment, outsider PR, or default-branch push. Public branch only; no confidential inputs.

## Why S109 was 3-wide sequential (truthful)

S109’s three sequential cohorts of 3 (contracts → packages → buyers) were a **parent orchestration choice**, not a measured platform max. Admission then had MemAvailable ≈10–11 GiB and PSI `some avg10=0.00`. Nothing in the runner forced size=3. S121 fixed that local choice: admit by measured headroom, then launch all requested cells together.

## Concurrent admission / overlap (measured)

| Marker | Value |
|---|---|
| Decision | `launch_9` (headroom estimate 51 ≥ 9; not an invented cap of 3) |
| Peak overlap at start | **9/9** grok Heavy |
| MemAvailable at admit | 10.408 GiB |
| MemAvailable at peak start | 10.383 GiB; PSI `some avg10=0.00` |
| At completion | 10.39 GiB; PSI `some avg10=0.00` |
| Constraint if 9 failed | **None observed** — all 9 launched and overlapped |

Receipts: `s121/receipts/admission.json`, `admission-concurrent.json`, `overlap-peak-start.json`, `overlap-midrun-2026-09-10T094513Z.json`, `completion-concurrent.json`, `prelaunch-snapshot.json`.

### Native session IDs

| Cell | Session ID | Exit |
|---|---|---|
| C1-diff-semantics | `01a08aaa-9fb2-73f0-ac7f-0dd2070ab73e` | 0 |
| C2-truncated-evidence | `01a08aaa-9f7a-7ad0-b01f-9d1135aa6576` | 0 |
| C3-rename-binary-nonewline | `01a08aaa-9f94-7e73-bbe1-1dbef388b58b` | 0 |
| C4-malicious-oversized | `01a08aaa-9ff5-7f22-96b0-3370e5d33c06` | 0 |
| C5-grexal-validate-runtime | `01a08aaa-9fce-7d01-989c-5008cba6c2ed` | 0 |
| C6-fee-edge-units | `01a08aaa-9fa0-7b51-b8ba-4ca9f0fc2434` | 0 |
| C7-artifact-archive-install | `01a08aaa-9fbf-7043-8b49-bcc7b0d6b306` | 0 |
| C8-agensi-paid-vs-free | `01a08aaa-9fee-7270-be44-4898491f270f` | 0 |
| C9-buyer-criterion-binding | `01a08aaa-9fec-70a2-a333-e34d291c6d63` | 0 |

Outs: `s121/out/C*.json`. Logs: `s121/logs/*.jsonl` (session streams; not buyer-acceptance proof).

## Corrected known facts

1. **Agensi seller surface** = `https://www.agensi.io/auth`, `https://www.agensi.io/sell`, MCP `https://mcp.agensi.io/mcp`. **`www.agensi.dev` Cloudflare Access is an unrelated tenant — do not enter.**
2. Local packager/parser ≠ Grexal paid execution; `structuralChecksPass` ≠ buyer escrow acceptance; JSON labels ≠ git-apply / bid-funding proof.
3. Public repository branches are **public**, not private overlays.
4. No unsupported exclusivity / proprietary claim on free upstream recipes (`claimsProprietaryOwnershipOfFreeRecipes=false`).
5. Official Grexal pin exercised: `npx --yes grexal@0.4.1 validate` → Manifest valid. Same install’s `--version` may print a lower CLI banner version — package pin remains `grexal@0.4.1`. Payments docs URL as recorded in `PINS.md` / fee worksheet source field.

## Implemented behavior (customer-usable)

### Grexal — `surfaces/grexal/package/`

- `agent/pack_evidence.js` — supplied unifiedDiff or local git range; truncation / rename / binary / no-newline / unsafe-path / size-limit checks; rejects unknown `rangeOp`; labels supplied diffs as not executed git ranges; omits oversized `unifiedDiff` embed (`unifiedDiffOmitted` + `unifiedDiffSha256`); hard non-claims: `grexalPaidExecution=false`, `gitApplyVerified=false`, `buyerAcceptanceVerified=false`.
- `bin/fee-worksheet.mjs` — offline docs clamp; integer micros; edges $0.05 cap-30pct, 66667µ floor-0.02, $0.08 floor, $0.10 nominal-20pct.
- `bin/validate-manifest.mjs` + official `npx grexal@0.4.1 validate`.
- Tests: **24/24**. Clean package tarball extracts and runs against external `S121_FIXTURES` (fixtures live outside the package).

### Agensi — `surfaces/agensi/package/`

- Official host handoff (`.io` seller; `.dev` Access forbidden).
- `bin/provenance.mjs` — free vs paid packaging delta; no proprietary claim on free recipe bytes; not a listing or paid MCP unlock.
- Offline descriptor validate + checklist. Tests: **15/15**.

## Not done / Root remains

- No Grexal login/push/publish/paid runs invoke; no Agensi creator session/listing/`get_skill confirm=true`.
- No bid funding, escrow acceptance, or git-apply success invented from labels.
- **Minimal remaining activation:** Root at `www.agensi.io/auth` for payout-rail eligibility; Root decides any Grexal first-push/price lines. Worker stays $0.
- **Weekly usage:** unavailable from this worker (unknown; not invented).

## Orchestration fix (local)

`s121/scripts/launch-concurrent.mjs` measures MemAvailable/PSI, estimates headroom, launches all nine independent consumer prompts together when reserve permits, and records actual overlap — no artificial groups of 3.

You are S121 consumer C5 (actual Grexal 0.4.1 manifest/runtime invocation). Cash boundary $0. No accounts, passwords, UI automation into Cloudflare Access, public listing, bid, payment, or PR to outsiders/default branch. Public branch: no confidential inputs. Prefer supplied fixtures + local commands; network only for official docs/registry already used by this experiment. Do not claim git-apply success, Grexal paid execution, or buyer escrow acceptance from JSON labels. Local packager ≠ provider paid run. Write result JSON to the path given. Keep changes under experiments/s109-marketplace-entry-trials/ only.

Package: experiments/s109-marketplace-entry-trials/surfaces/grexal/package
Official CLI pin: grexal@0.4.1 (npm). Docs: https://docs.grexal.ai (payments/manifest as previously pinned).

Tasks:
1. From the package directory, run `npx --yes grexal@0.4.1 validate` (no login/push/publish). Capture stdout/stderr.
2. Run local pack_evidence once on fixtures/diff/simple.patch to show local entrypoint works. Explicitly set grexalPaidExecution=false — this is not a provider paid run.
3. If validate fails for a real schema mismatch vs 0.4.1, fix grexal.json minimally to satisfy official validate without adding rejected marketplace metadata fields.
4. Write s121/out/C5-grexal-validate-runtime.json with exact commands and exit codes.

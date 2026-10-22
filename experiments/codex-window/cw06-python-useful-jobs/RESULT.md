# CW06 execution receipt

## Result

Built a Python 3 standard-input interoperability consumer around the exact
released SameDayDesk useful-jobs 1.4.0 Node.js CLI. The consumer accepts bounded
caller-owned UTF-8 bytes, safely materializes them, invokes the released CLI
without a shell, verifies the exact catalog artifact set, writes a SHA-256 result
manifest, and publishes only by a final directory rename.

Ten offline jobs remain ten offline jobs, not ten paid HTTP endpoints.

## Source and candidate

- Repository: `epistemedeus/samedaydesk`
- Exact public base: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`
- Candidate branch: `codex/cw06-python-useful-jobs-20260912`
- Owned path: `experiments/codex-window/cw06-python-useful-jobs/`
- Release archive SHA-256:
  `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`
- Release archive bytes: `2575215`

## Prior-work reuse decision

Pilot Wave 5 inventory was read before implementation:

- D08 (`feaa2f8791a693bd9c3ef5211e752307e188b96c`) supplied the verified-extract,
  process-group cleanup, and missing-output patterns, but is pinned to 1.0.0.
- D24 (`195185651023b6731351f416e6a7cfb9708c7d9d`) supplied clean-prefix and
  domain-outcome controls, but binds unreleased D01/D07/Co14 branches.
- M14 (`eec99b7c4f56be3636681d5ebe31c8f8d2edd217`) supplied concise result-status
  presentation, but requires a SameDayDesk monorepo checkout.

CW06 adapts those lessons without copying their packages or depending on their
unreleased branches.

## Actual execution

Execution surface: disposable ChatGPT Work Linux virtual machine, Python
3.12.14, Node.js v24.19.0, public Git clone plus connected GitHub source reads.

- CW06 Python suite: **10 passed, 0 failed, 0 skipped**.
- Released archive `npm test`: **15 passed, 0 failed, 0 skipped**.
- Released archive `scripts/accept-all.mjs`: **12 accepted**, exit 0.
- Real released CLI caller runs from a generated zip application in a clean
  temporary directory: lockfile pin delta, JSON Schema webhook drift, and
  vendor budget partial; all three produced their complete distinct artifact
  sets and manifests.

Controls executed: malformed caller input/real engine failure, timeout with
owned process-group kill and reap, archive digest mismatch, raw stdin and caller
file byte limits, input traversal, exact/partial artifact mismatch, occupied
and stale output, valid `partial` domain result, Unicode and path spaces, and
literal shell metacharacters.

## Observed release compatibility hinge

The released original-six jobs unpack pinned nested archives using GNU tar.
In this user-namespace filesystem, tar cannot apply stored uid/gid ownership.
The unmodified CLI initially refused `vendor-budget-impact` after correct byte
extraction. CW06 supplies the standard consumer-side environment option
`TAR_OPTIONS=--no-same-owner`; the bytes remain pinned and the real partial job
then passes. This is recorded in each result manifest.

## Limits and side effects

- No operating-system network isolation is claimed for JavaScript hooks.
- No HTTP fetch, payment, purchase, deployment, provider-credit action, or
  message was performed.
- No shared engine, release archive, homepage, offer, or other owner's path was
  edited.
- The personal-history lookup was unavailable; authoritative Pilot inventory
  and exact repository sources were available and used.


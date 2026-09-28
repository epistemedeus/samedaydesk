# CW39 independent source review and scoped repair

Reviewed source: `84257ecca8e8e91f51b73f76088d0816a48c05d2`.
Candidate branch: `codex/cw39-python-kit-consumer-20260912`.
Scope: this Python consumer directory only. No released engine or archive edit.
Review/build ran on the native remote Linux VM without child models.

## Witnessed defects

1. **Tool success became delivery on a refused domain result.** The exact released
   `vendor-budget-impact` CLI, given `{"notPricing":true}` before/after files,
   exits 0 and reports `ok:true,status:"refused"`. The old wrapper accepted its
   artifacts. The repaired consumer returns `engine-failed`, executed true,
   published false, and leaves no result directory. Valid partial budget input
   still publishes with `domainStatus:partial`.
2. **Content was not validated.** A truncated JSON file and empty Markdown file
   with expected names passed the old artifact validator. The new validator
   checks bounded regular owned files, strict UTF-8/JSON, released envelope
   identity and report consistency, and complete supported text envelopes.
3. **Output ownership could be lost.** A dangling destination symlink caused
   publication at its target. An empty directory inserted immediately before
   `Path.rename` was replaced. The repair pins parent descriptors, stages on the
   destination filesystem, and uses atomic Linux no-replace rename. Symlinks,
   files, and racing directories remain untouched. A parent swap cannot redirect
   staged writes; publication refuses if the original parent identity changed.
4. **Timeout missed detached descendants.** An original-wrapper timeout left a
   detached process alive. The audit's outer supervisor reaped that witness.
   Released `lib/owned-spawn.mjs` itself uses detached sessions. Each repaired
   invocation uses a dedicated Linux subreaper, cleans surviving descendants
   after timeout or normal parent exit, and leaves unrelated caller children
   alone. This also contains the released CLI's temporary directories in a
   private scratch directory that is removed after process cleanup.
5. **Raw archive paths were normalized before validation.** Dot and duplicate
   slash components were accepted. The repair checks raw components, disallows
   links/special/sparse members and duplicate paths, applies incremental member
   and expanded-byte limits, and ignores archived owner/mode metadata. A bounded
   private archive snapshot prevents caller-path substitution after verification.
6. **Bounds and malformed transport had gaps.** The old capture limit ran only
   after `communicate` had buffered output. A lone Unicode surrogate escaped as
   `UnicodeEncodeError`; non-finite timeout values were accepted. Live stream
   limits, strict JSON/UTF-8 checks and finite timeout checks now refuse closed.

## Verification

The unmodified base's **10 wrapper tests passed** before repair. The unmodified
released archive's **15 tests passed** on Node 22.23.2 using
`node --test --test-concurrency=1` and a 768 MiB Node heap limit. Its separate
`accept-all.mjs` was not rerun because it hardcodes up to four workers; the prior
CW06 acceptance claim remains historical evidence.

The candidate suite passes **44 tests, zero failures or skips**, including the
original tests plus newly authored archive,
process, output, and packaging regressions. The task-level `RESULT.md` records the exact candidate head. In particular, it checks the actual
released detached-spawn helper and corruption injected after real CLI success.

Three new caller inputs exercise lockfile added/removed/changed pins, a breaking
used-schema path with unrelated drift excluded, and partial held pricing rows.
They run through both a freshly built zipapp and a freshly installed virtual-env
console script from a directory outside the checkout. All six standalone calls
validate artifact contents and hashes. Temporary execution uses `/dev/shm` while
publication uses the workspace filesystem; private engine scratch is empty after
all runs. Rebuilding the zipapp includes only runtime code, not its previous
output or caller files. Literal argument tests include empty arguments, Unicode,
spaces, quotes, newlines, leading dashes, dollar expressions, and backticks.

The repository archive is 2,575,215 bytes with SHA-256
`2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`.
A live download from the public SameDayDesk host failed TLS negotiation with both
Python and curl on this VM. No live-host byte match is claimed. Executions use
the exact archive from the requested immutable repository commit.

## Evidence limits

These are self-authored owner QA and source-review results, not independent
production/customer use, market demand, revenue, or proof of domain correctness.
The wrapper validates delivery structure and consistency; it does not recompute
the released engines' semantics. `--no-same-owner` fixes GNU tar user-namespace
portability. It does not provide a security sandbox. Node retains the caller's
filesystem/network permissions; artifact byte limits apply at validation rather
than imposing a live disk quota. Referenced companion-file paths retain engine
rules, and the v1 stdin interface does not materialize companions or optional
CLI flags. Linux/procfs/renameat2 are now explicit runtime requirements.

No server or port was needed. No production merge/deploy, payment/signature,
provider spend/reset, or external outreach was performed. Feature push and draft
PR are the only authorized repository publication actions for this candidate.

# VF08 result: portable visitor-built execution

Implemented and tested on Root's native Astra Cursor VM (`hostname=cursor`, Linux
x86_64, Node 22.22.2, Python 3.12.3). Concrete source and tests are confined to
`scripts/visitor-foundry/execution/`, branch
`codex/visitor-portable-execution-20260926`. No subordinate model workers, new
login, deployment, production migration, shared-runtime change or VF04A edit.

## Exact implementation and reuse

Implementation/test pin: **`24d4d1c02abc633f9d56c9613d29dde99a7ba2a3`**.
Later commits retain final evidence, RESULT and the Heavy plan. Early source
checkpoint `9673c8e` preceded runtime tests; `b2f6081` was pushed through existing
auth before the final review. See CHECKPOINTS for failures and corrections.

Started from assembled `d1364b5`, containing Neo
`28924aac2a33cdf58bc9049a2198ab1ce9866f0f`, VF01
`5c38974c28c3c376f2cdd90a91c91e67eb7d00b5`, VF02
`47fe95ceaba28f6b87e9b4efc8b202b5ffaf1a5f`, VF03
`2689a197786cead5bcf3476f63aa14fe5da46d44`. VF04A
`377c6a86b9ac22573d7fff88b39b7db05877dfef` was read via Git objects only, including
its actual store/recipe/supervisor/manifest and handoff documents. F93 remains
with its receiving owner; no shared foundation schema was edited.

Source inspection found no prior Wasmtime/Wasm component adapter in the existing
scripts/services. Reused VF01's actual full reference/content/JSON/shape validators,
Exchange 01's objective-check evaluator, and VF03's actual legacy receipt validator.
Existing Exchange checks evaluate submitted JSON and do not execute arbitrary
components. Existing correspondence MCP toolText/toolError and its test extraction
helper informed the portable example; the shipping product was not copied/replaced.

The foundation supplies unique versioned artifact, ABI, observation and verification
contracts; a real official Wasmtime 49.0.0 child; fresh state per invocation;
no guest imports/WASI/network/filesystem/environment; separate compilation,
instantiation and execution ceilings; OS process limits; cancellation with actual
exit witnessing; unknown-result preservation; and private opt-in verify/invoke
ports. It is not another registry, scheduler, durable host or evidence authority.

The actual C component compacts correspondence structured results, preserving
explicit errors and unknown write outcomes. Its binary is **3356 bytes**,
SHA-256 `37e04d035231a179a3408e98ab6bc68c54d9a61996554de38e75554465076121`.
The module builds with existing Clang 18.1.3 plus the already installed Wasm linker;
source/module/compiler/linker pins are in the retained journey's build receipt.

## Executed acceptance

| Remote command | Final outcome | Evidence |
| --- | --- | --- |
| `npm run build --prefix scripts/visitor-foundry/execution` | Real freestanding C → Wasm compile/link, exit 0 | journey.json build record |
| `npm test --prefix scripts/visitor-foundry/execution` | **25 pass, 0 fail/cancel/skip**, 12037ms | focused-final.tap |
| `node --test scripts/visitor-foundry/capabilities/tests/*.test.mjs scripts/visitor-foundry/validation/tests/*.test.mjs` | **112 pass, 0 fail/skip**, 1082ms | foundation-regression.tap |
| Fresh CLI owner-QA journey inside the focused suite | Six separate B Node processes and six fresh Wasmtime children; all six expected outputs matched | journey.json |
| `git diff --check` and ownership audit | Clean; only owned subtree differs from assembled base | final source review |

137 final passing tests, not counting repeated earlier runs as additional tests.
No absent runtime/isolation acceptance was skipped. Tests cover real useful output,
opaque bytes, malformed/truncated/text/native-looking modules, forbidden imports,
unsupported features, fuel exhaustion and infinite start/transform loops, fixed
memory/table growth, oversized output/input/module, bad unsigned pointers/lengths,
stack exhaustion, traps, invalid UTF-8/JSON/shape, bounded compilation timeout,
address-space failure, pre-abort and real child cancellation, guest state isolation,
private sentinel/environment absence, incorrect ABI, failed durable launch gate,
stale fences/candidate/evaluator/runtime, finite-scope verification and an
unwitnessed-exit outcome that cannot become a passing receipt. Runtime tests inspect
actual post-exit PID absence. The unknown-witness test deliberately withholds the
kill operation, proves the child remains alive, then explicitly kills/reaps it.

## Measured owner-QA reuse and evaluator controls

All cases and expected outputs were frozen in `example/heldouts.json` before the
journey. A fresh A CLI packages the actual C implementation; the installed verifier
executes it on those cases. Fresh B CLI processes load only the packaged descriptor,
module and their task input. No shared guest state, cached module or transcript.
The journey is a source-level cold reuse proof, **not durable VF04A admission or
public discovery**. The later processes are owner-controlled, not external users.

| Evaluator control | Useful component accepted | Faulty constant-output control accepted |
| --- | ---: | ---: |
| Independently implemented exact expected-output oracle | 6 / 6 | 0 / 6 |
| Always-pass fake evaluator | 6 / 6 | 6 / 6 |
| Always-fail fake evaluator | 0 / 6 | 0 / 6 |

Two unknown_outcome cases and the unsupported text-only case are correct explicit
results, not successful external tasks. The faulty control is supplied constant
output used to test evaluator discrimination, not a claimed external benchmark.
No independent operator, customer traffic, commercial uplift, provider spend or
token savings is inferred.

Measured six-case verifier elapsed: **691.42ms**. Across six cold B uses:

| Measurement | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| Child spawn-to-exit wall, ms | 74.14 | 74.80 | 75.93 |
| Whole child CPU, ms | 60.36 | 60.68 | 61.93 |
| Compile within child, ms | 5.29 | 5.31 | 5.43 |
| Guest transform/ABI work, ms | 0.246 | 0.250 | 0.276 |
| Peak child RSS, bytes | 44,269,568 | 44,312,576 | 44,339,200 |
| Guest fuel used | 2,497 | 10,841.5 | 14,258 |

Fresh Node CLI end-to-end wall ranged **182.56–192.73ms**, including setup/pinning
and process overhead. One small serial owner-QA run is not a throughput SLA or
whole-host capacity test. Failure usage stays unknown where not observed. Reserved
CPU/wall/address-space ceilings are not measured cost, RSS or token savings.

## Limits and receiving work

Wasmtime is the sandbox; the worker remains an ordinary same-UID process. No
seccomp, container, cgroup, independent native-escape protection or total-RSS
isolation is claimed. Rlimits bound virtual address space, CPU, stack, file size,
FDs and core files. The 1MiB file ceiling is required for trusted libffi startup
on this VM; guests still have no filesystem API. Runtime installation is local and
pinned by wheel hash, with Apache-2.0 WITH LLVM-exception license. CONTRACT lists
all default/max limits and official API sources.

Passing execution is observed behavior; passing frozen tests gives exact-input
applicability only. VF04A's current whole-domain publication rule for its fixed
recipe cannot be applied to this component. Unknown physical outcomes retain
reservation uncertainty, and this adapter does not recover a dead supervisor.
The full VF01 domain survives portable records; unsupported legacy VF03 references
are explicitly refused at the optional projection until F93's receiving seam is
reconciled.

[HEAVY-RECEIVING-PLAN.md](HEAVY-RECEIVING-PLAN.md) names exact admission, policy,
per-sample process persistence, publication and asynchronous immutable-invocation
changes, plus eleven groups of receiving integration tests. It explains why the
old single-process COALESCE identity and synchronous SQL-held invocation cannot
be reused unchanged. Those are receiving work, not hidden completed claims.

Initial failures are retained in runtime-initial.tap: WAT import order and unknown
fixture cleanup were harness defects, fixed without weakening gates. Python
ensurepip and the missing wasm-ld-18 alias were handled entirely within the owned
subtree and existing toolchain. Focused 02/03 and final runs are all retained.

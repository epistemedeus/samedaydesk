# Portable execution contract v1

Canonical executable contract: `src/contracts.mjs`. Schemas are uniquely named
`neomorphic.foundry.portable-execution.{artifact,observation,verification}.v1`.
They do not reuse any VF01/VF02/VF03 shared schema ID. No registry, work lease,
verification-assignment authority, durable journal, promotion or budget store is
implemented here. Legacy projection is a private receiving seam, not a new API.

## Artifact and identities

`artifact.id` is VF01 canonical SHA-256 of the entire artifact except `id`:

| Field | Binding |
| --- | --- |
| capability | Full VF01 immutable CapabilityVersion, including all three reference coordinates, complete source descriptor, rights, dependencies, provenance, input/output and contentId |
| module | SHA-256 of exact binary Wasm bytes and exact byte length; digest must also occur in the capability provenance refs |
| abi | `vf08.transform-buffer.v1` |
| input/output | `{encoding:"json",shape:VF01Shape}` or `{encoding:"bytes",shape:null}`; JSON shapes equal capability input/output |
| profile | Exact `PROFILE` in source: official Wasmtime Python 49.0.0, Linux x64, fixed memories/tables, no imports, canonical NaNs, no parallel compilation |
| limits | All resource ceilings, validated against fixed host admission caps |
| evaluation | Namespaced installed evaluator ID, revision and digest of complete tests/expected outputs |

The artifact digest is distinct from module digest, source-descriptor digest and
VF01 capability contentId. The module does not contain its own manifest hash, so
there is no circular identity. Contributors cannot choose a new evaluator merely
by writing its name: `verify` compares it with the host's installed policy.
Current dependency arrays must be empty because no composition mapping exists.
Source references declare provenance; execution alone does not attest that bytes
were built from claimed source or that declared rights were independently checked.
The example's build receipt records actual C/module/compiler/linker hashes.

VF01 reference domain is preserved by importing its actual validators. Full-length
IDs, non-ASCII versions and complete content pins round-trip in tests. No coercion,
truncation or surrogate identity is used. VF03's old 160-character ID/256-character
revision domain is narrower: the optional legacy projection calls its validator
and explicitly refuses unsupported values. Receive the full VF08 record through
F93's repaired adapter; never shorten IDs to make a receipt fit. The owner-QA CLI
has an explicit 64KiB artifact-file admission limit; the library retains VF01's
16MiB JSON bound. This is an explicit CLI limit, not a changed reference domain.

## ABI and feature profile

Binary core Wasm only. WAT and contributor-supplied serialized native/AOT artifacts
are rejected by the header gate, and `Module.deserialize` is never used. Wasmtime
performs full Wasm validation/compilation. A small binary section reader enforces
only structural resource/import admission; it is not a compiler or sandbox.

Exactly these exports are required:

- `memory`: one non-shared wasm32 linear memory with initial == maximum pages.
- `alloc(i32 input_length) -> i32`: return an unsigned offset for input bytes.
- `transform(i32 input_offset, i32 input_length) -> i64`: return
  `(unsigned_output_length << 32) | unsigned_output_offset`.

The parent passes JSON as UTF-8 `JSON.stringify` bytes, or caller-provided opaque
bytes. The guest owns its fixed memory layout. `alloc`, start functions and
`transform` share the one fuel allowance. All offsets/lengths are checked against
current memory length using subtraction, and output size is checked before any
copy. Negative Wasm integers are interpreted as unsigned bit patterns, not Python
slice offsets. JSON output requires valid UTF-8, finite bounded JSON and the exact
VF01 output shape. Bytes output stays bytes; no host deserialization of code.

No imports, WASI, linker definitions, inherited guest environment, clocks,
randomness, filesystem, sockets, or callbacks. An import declaration is rejected,
even if unused. At most one internal fixed-size funcref table. MVP scalar numeric
operations, bulk memory, reference types for funcref and multi-value are supported
by the pinned runtime. Threads/shared memory, SIMD/relaxed SIMD, memory64,
multi-memory, components, GC, typed function references, exceptions, stack
switching, tail calls, custom page sizes and wide arithmetic are disabled. New
runtime features require a new reviewed profile and evidence, not a silent upgrade.

Fixed memory/table sizes force nonzero growth attempts to fail deterministically;
NaNs are canonicalized and fuel is deterministic. Resource admission, process
scheduling and wall time can still fail or time out. Deterministic output for a
completed execution is not a promise of identical operational success across hosts.

## Bounds and accounting

| Resource | Default | Maximum admitted |
| --- | ---: | ---: |
| Module bytes | 256KiB | 256KiB |
| Input / output bytes | 16KiB / 32KiB | same |
| Guest memory | 256KiB | 4MiB; whole pages |
| Guest tables/elements | 1 / 128 | same; fixed min=max |
| Wasm stack | 64KiB | 64KiB |
| Wasm fuel | 1,000,000 | 10,000,000 |
| Startup + compile | 1500ms | 3000ms |
| Instantiation | 500ms | 1000ms |
| Execute + exit | 500ms | 2000ms |
| Entire child wall | 4000ms | 8000ms |
| OS virtual address space | 512MiB | 512MiB |
| OS CPU | 2s | 2s |
| OS native stack | 8MiB | 8MiB |
| OS individual file size | 1MiB | 1MiB |
| OS open file descriptors | 32 | 32 |
| Core file size | 0 | 0 |

`prlimit` applies equal hard/soft ceilings **before Python starts**. The worker
checks effective ceilings before importing Wasmtime. Compilation has module-size,
OS CPU/address-space and parent wall bounds; it does not consume guest fuel.
Instantiation separately has store limits, the same fuel pool (including start
functions), OS ceilings and its phase timer. Execution adds ABI output bounds.
Parent protocol output is capped at 64KiB + twice the output cap. All tests are
serial and small; the largest compilation fixture is under the module byte cap.

Timers request SIGKILL. Success also checks elapsed monotonic time at phase changes
and exit; delayed timers cannot certify an over-budget success. Exit grace is
1000ms beyond the execution timeout, not another execution allowance. Until an
actual child `exit` event, a result or successful kill request proves nothing.
If exit is not witnessed within grace, `status:"unknown"`, `termination.exited:false`
retains that uncertainty. The receiver must retain capacity and reconcile using
its supervisor authority. There is no timer/PID-only capacity release or retry.
Pre-aborted calls and spawn errors carry `noLaunch:true`, distinct from an exit.
A launch-identity commit failure kills the child before guest bytes are sent.

Unknown within a verification run aborts the remaining samples. Reservations must
cover all case ceilings (CPU/wall summed, address space at serial peak) before any
child launches. VF04A owns admission/concurrency across calls; directly invoking
this library repeatedly is not a scheduler or a total-host resource guarantee.

Observed wall includes spawn-to-exit/grace. Success records process CPU including
startup/import/compile, peak RSS from Linux `getrusage`, consumed fuel, and measured
compile/instantiate/execute durations. Parent hashing and JSON validation are not
included in child CPU; the journey separately records fresh CLI end-to-end wall.
Failure CPU/RSS/fuel remain null rather than inferred from reserved caps. Currency
cost, model tokens, sharing effort and commercial uplift are unknown.

## Tested isolation and trust limit

This is Wasmtime's guest sandbox plus a constrained ordinary child process under
the current OS user. **It is not a container, seccomp policy, separate UID, mount
namespace, cgroup, or native-runtime-escape defense.** RLIMIT_AS bounds virtual
address space, not an independently configured RSS budget. Store memory limits do
not account for all compilation/runtime allocations. Kernel/shared memory and
parent-process memory are not a measured whole-host budget. No stronger isolation
is claimed. Before hosted use, Heavy must review the native-runtime trust boundary
and use the existing host's approved isolation facilities.

Only explicit `LANG=C` and `LC_ALL=C` enter the child environment (Python may add
LC_CTYPE); cwd is `/`, stdio are private pipes, and guest imports remain empty.
The native embedding can still access files as its OS user if compromised; the
private-file test establishes lack of guest access paths, not resistance to a
Wasmtime/native exploit. No project secrets are deliberately sent to the worker.
Python libffi needs a small temporary executable backing file on this VM; a zero
file-size ceiling prevented import, so the tested 1MiB ceiling is recorded honestly.

## Observation, verification and receiving ports

Execution binding retains assignmentId, candidateId, attempt fence, full capability
reference, source/artifact/module/dependency digests, evaluator/test digest,
environment digest and actual runtime installation pin. Installation includes
Python binary, all Wasmtime Python source files, native library bytes, worker,
Node version and supervisor/contracts source. Installed policy additionally binds
the verifier and existing objective-evaluator source. Hashes establish identity,
not authentication. Installation must be immutable to untrusted contributors.

`invoke` reports `observed_execution` with `compatibility:"unqualified"`; a clean
exit cannot promote anything. `installedPolicy` freezes a bounded host-owned
suite and expected outputs. `verificationResult` reports pass/fail/incomplete for
exact inputs only and requires witnessed successful executions to pass. Missing,
unknown, timed-out, trapped, cancelled or malformed results are incomplete.
The independent oracle reuses Exchange's `json_path_equals` check with canonical
VF01 JSON. Contributor test proposals never become executable verifier code.

`createReceivingPorts({enabled,policy,loadVerification,loadInvocation})` is private
installed wiring. `loadVerification({projectId,assignmentId})` returns a current
durable attempt `{assignment,fence,artifact,moduleBytes}`; it must check host
assignment authority and withdrawal before returning. The port rereads before
each case, rejects changed bindings/fences and allows `onSpawn` to persist each
case identity before releasing bytes. Receiver retains prelaunch intent first.

`loadInvocation({projectId,manifestId,request})` must authenticate the caller,
recheck current evidence/runtime/source withdrawal and durable immutable manifest,
and reserve physical execution before returning `{manifest,artifact,moduleBytes,
binding}`. Port checks exact manifest/request/target pins; its callback is not a
substitute for VF04A's authoritative lifecycle. Receiver persists the observed
output and rechecks validity before returning/replaying it. Both loaders are
installed host functions, never URLs, contributed code or caller JSON authority.

`toVF03Receipt` accepts only the receiver's own immutable VF08 result, checks its
content and assignment/fence binding, and rejects unknown termination. Its output
uses the existing VF03 underscore schema, validated by the actual VF03 validator.
The receiver must retain the VF08 record (including fence and full references),
dispatch with the assigned VF03 runner handle and apply the publication scope
rules in the receiving plan. A submitted lookalike receipt is not authenticated.
Do not publish `inputDigest:null` merely because the finite test list passed.

## Dependency provenance and primary API checks

- Official `wasmtime==49.0.0` manylinux1 x86_64 wheel, SHA-256
  `94f0288f9e1c33924995a72bb769f4c4e2885002391589dd6992cdaa35d1990a`.
  License: Apache-2.0 WITH LLVM-exception, confirmed in wheel metadata/license;
  native dependency and bindings remain task-local and unmodified.
- [Official Python binding API](https://bytecodealliance.github.io/wasmtime-py/):
  Config feature/memory/stack controls, Store.set_limits and fuel, Module/Instance,
  and bounded memory access were also read in the installed 49.0.0 source.
- [Wasmtime security](https://docs.wasmtime.dev/security.html) and
  [security vulnerability scope](https://docs.wasmtime.dev/security-what-is-considered-a-security-vulnerability.html)
  establish the runtime sandbox boundary, not an OS-container guarantee.
- [Interruption](https://docs.wasmtime.dev/examples-interrupting-wasm.html),
  [determinism](https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html),
  and [resource limiter source](https://docs.wasmtime.dev/api/src/wasmtime/runtime/limits.rs.html)
  informed the separate compilation bound, fixed memory/table profile and fuel use.

No runtime code was copied into a custom sandbox. Existing maintained source was
read and reused, and shared foundation contracts were not modified.

# VF08 checkpoints

2026-09-26: Read assigned source pins and VF04A 377c6a8 via git show only.
Implemented initial unique artifact contracts, task-local Wasmtime 49 worker,
resource-limited parent supervisor and C structured-result example. Before full
runtime/adversarial tests, checkpoint source. No shared runtime or foundation edit.

Setup finding: system Python lacks ensurepip. The installer uses stdlib venv
--without-pip plus the SHA-256-verified official wheel; no apt/system modification.
Build finding: installed Clang has no wasm-ld-18 on PATH. Build explicitly compiles
an object then links with the already installed Rust toolchain's wasm-ld.

- `9673c8e`: early source checkpoint before runtime tests.
- `b2f6081`: verification ports, C implementation and adversarial tests; pushed
  through existing Git auth before final source review. 22 focused + 112 VF01/VF03
  tests passed at this pin. No skips.
- Self-review added a monotonic elapsed-time check at phase transitions and exit,
  so delayed event-loop timers cannot turn an over-budget return into success.
  Added ABI/UTF-8/shape, module-size and failed durable launch-gate regressions.

Retained failures: runtime-initial.tap was 12 pass, 1 fixture failure (WAT imports
must precede memory), 1 fixture cancellation (unref'd deliberately unknown child
needed ref() before cleanup await). Both harness defects were corrected without
weakening assertions. Focused runs 02 and 03 passed. The initial zero-byte file
ceiling prevented trusted libffi initialization; tested profile uses a bounded
1MiB RLIMIT_FSIZE. It still exposes no guest filesystem operation.

- `24d4d1c02abc633f9d56c9613d29dde99a7ba2a3`: final implementation pin,
  checkpointed before final suite. 25 execution tests passed, 0 skipped; earlier
  112 imported-foundation regressions remained passing with those files unchanged.
- Exact README setup/build commands completed after tests. Reinstallation preserved
  the runtime pin and rebuilding reproduced the identical 3356-byte module digest.
  Final documentation/evidence commit carries those receipts and the Heavy plan.

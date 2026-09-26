# VF08 portable component execution

An opt-in, source-only Wasmtime adapter for visitor-built bounded data transforms.
It supplies execution and assigned-verifier ports. VF04A remains the durable host,
assignment, receipt-admission, budget and publication authority. No service starts,
no migrations run, and no default host behavior changes by importing this code.

## Reproduce on the remote Linux x86_64 checkout

Requires existing Node 22, Python 3 with stdlib venv, `/usr/bin/prlimit`, `/proc`,
Clang and a Wasm linker. Installs only a pinned 10MB official wheel under this
subtree. It does not require system pip, apt, Rust compilation, accounts or keys.

```sh
npm run setup --prefix scripts/visitor-foundry/execution
npm run build --prefix scripts/visitor-foundry/execution
npm test --prefix scripts/visitor-foundry/execution
npm run demo --prefix scripts/visitor-foundry/execution
node --test scripts/visitor-foundry/capabilities/tests/*.test.mjs scripts/visitor-foundry/validation/tests/*.test.mjs
```

`VF08_WASM_LD` can name an already installed linker. Default uses the existing VM's
Rust 1.83 toolchain linker; Clang compiles the freestanding C object separately.
The example source and generated binary hashes, compiler and linker identity are
in `.build/build.json`. Build output and the private runtime are ignored by Git.
Missing runtime/toolchain/isolation is a failure, never a skipped acceptance test.

The demo packages A's component, verifies six frozen cases using an independently
implemented expected-output oracle, then invokes it through six fresh B CLI
processes. It writes `evidence/journey.json`, including every outcome and usage.
These are owner-controlled clients and synthetic inputs, not independent demand.
The raw CLI below is owner QA execution, not authenticated registry use:

```sh
node scripts/visitor-foundry/execution/cli.mjs runtime
node scripts/visitor-foundry/execution/cli.mjs package \
  scripts/visitor-foundry/execution/.build/structured-result.wasm \
  scripts/visitor-foundry/execution/.build/artifact.json "$(git rev-parse HEAD)"
cat > scripts/visitor-foundry/execution/.build/input.json <<'JSON'
{"isError":true,"structuredContent":{"error":{"code":"unknown_outcome","retryable":false,"reconcile":true}}}
JSON
node scripts/visitor-foundry/execution/cli.mjs invoke \
  scripts/visitor-foundry/execution/.build/artifact.json \
  scripts/visitor-foundry/execution/.build/structured-result.wasm \
  scripts/visitor-foundry/execution/.build/input.json
```

The example preserves structured payload and explicit error/unknown status while
removing duplicate MCP text. A text-only result is `unsupported`; it cannot become
an accepted job, delivery, payment, or authorization. `observed` means a supplied
structured payload was observed. Unknown write outcomes retain reconciliation
and retryability fields. See the existing production shape in
`tools/correspondence-mcp/src/tools/write.mjs#toolText,toolError` and the existing
read helper in its `tests/sdk-pg.integration.test.mjs`. Those files are unchanged.
The new contribution is the portable C compact/status-preserving implementation;
it does not claim invention of the existing MCP wrapper or JSON extraction.

## Entry points

- `src/contracts.mjs`: unique versioned artifact/ABI validation using VF01's actual
  full-reference, immutable-content, bounded JSON and shape validators.
- `src/supervisor.mjs#invoke`: exact bytes + artifact + input + binding; returns
  output separately from the immutable execution observation. A fresh process,
  engine, store, module and instance per call; no guest state or compiled cache.
- `src/ports.mjs#createReceivingPorts`: disabled unless explicitly enabled.
  Installed loaders reread durable VF04A authority; callers cannot supply a new
  module, assignment, manifest or test suite through these ports.
- `src/ports.mjs#toVF03Receipt`: explicit legacy receipt projection. It cannot
  authenticate records; only receiver-owned execution records belong here.
  Preserve the full VF08 record alongside it. F93's receiving owner must adapt
  this seam to the repaired shared contract rather than changing shared files here.

Read [CONTRACT.md](CONTRACT.md) for exact limits and authority boundaries,
[RESULT.md](RESULT.md) for executed results, and
[HEAVY-RECEIVING-PLAN.md](HEAVY-RECEIVING-PLAN.md) before integrating.

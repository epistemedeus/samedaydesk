import pin from "./PIN.json" with { type: "json" };

// Distinct from vf08.wasmtime49-linux-x64-fixed.v1. Hash order does not matter;
// the canonical digest includes every field below.
export const EMBED_PROFILE = Object.freeze({
  id: pin.id,
  runtime: pin.runtime,
  version: pin.version,
  capiSha256: pin.capiSha256,
  license: pin.license,
  platform: "linux",
  arch: "x64",
  imports: "none",
  memory: "fixed-wasm32",
  tables: "fixed-funcref",
  nan: "canonical",
  parallelCompilation: false,
  wasi: false,
  distinctFrom: pin.distinctFrom,
});

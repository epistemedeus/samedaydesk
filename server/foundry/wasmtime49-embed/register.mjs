import { register } from "node:module";

const FLAG = Symbol.for("sds.foundry.wasmtime49-embed-hooks");
if (!globalThis[FLAG]) {
  register("./hooks.mjs", import.meta.url);
  globalThis[FLAG] = true;
}

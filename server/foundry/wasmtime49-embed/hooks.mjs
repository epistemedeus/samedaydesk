import { EMBED_PROFILE } from "./profile.mjs";

const PROFILE_START = "export const PROFILE = freeze({ id: 'vf08.wasmtime49-linux-x64-fixed.v1'";

function rewriteContracts(source) {
  const text = typeof source === "string" ? source : Buffer.from(source).toString("utf8");
  if (!text.includes(PROFILE_START)) {
    const error = new Error("embed profile rewrite did not match the sealed reference profile");
    error.code = "embed_profile_rewrite_failed";
    throw error;
  }
  const pattern = /export const PROFILE = freeze\(\{[\s\S]*?\}\);/;
  if (!pattern.test(text)) {
    const error = new Error("embed profile rewrite did not match the sealed reference profile");
    error.code = "embed_profile_rewrite_failed";
    throw error;
  }
  return text.replace(pattern, `export const PROFILE = freeze(${JSON.stringify(EMBED_PROFILE)});`);
}

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || "";
  if (parent.includes("/server/foundry/wasmtime49-embed/")) return nextResolve(specifier, context);
  const resolved = await nextResolve(specifier, context);
  if (resolved.url.includes("/execution/src/supervisor.mjs")) {
    return { url: new URL("./invoke.mjs", import.meta.url).href, shortCircuit: true };
  }
  return resolved;
}

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);
  if (!url.includes("/execution/src/contracts.mjs")) return loaded;
  if (loaded.source == null) {
    const error = new Error("embed profile rewrite could not read contracts");
    error.code = "embed_profile_rewrite_failed";
    throw error;
  }
  return { format: loaded.format || "module", shortCircuit: true, source: rewriteContracts(loaded.source) };
}

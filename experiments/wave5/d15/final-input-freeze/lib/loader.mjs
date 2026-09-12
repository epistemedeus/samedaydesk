import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mutateUrl = pathToFileURL(join(here, "mutate-after-prepare.mjs")).href;

function asText(source) {
  if (source == null) return "";
  if (typeof source === "string") return source;
  return Buffer.from(source).toString("utf8");
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.includes("/managed-useful-jobs-order/lib/create-order.mjs")) return result;
  let source = asText(result.source);
  if (!source.includes("export async function runCreateOrder")) return result;
  source = source.replace(
    "export async function runCreateOrder(raw, options = {}) {",
    "async function runCreateOrderUnwrapped(raw, options = {}) {",
  );
  source += `
import { mutateAfterPrepare } from ${JSON.stringify(mutateUrl)};
export async function runCreateOrder(raw, options = {}) {
  mutateAfterPrepare(raw);
  return runCreateOrderUnwrapped(raw, options);
}
`;
  return { format: "module", source, shortCircuit: true };
}

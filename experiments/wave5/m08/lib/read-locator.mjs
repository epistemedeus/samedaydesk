import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { classifyHttpLocator, isHttpLocator } from "./detect-format.mjs";
import { refused } from "./errors.mjs";

const MAX_BYTES = 1_048_576;

export async function readLocatorText(locator) {
  if (isHttpLocator(locator)) {
    const classified = classifyHttpLocator(locator);
    if (!classified.supported) {
      refused("unsupported_format", `Catalog locator format ${classified.format} is not a claimed supported route catalog`, {
        format: classified.format,
        locator,
      });
    }
    let res;
    try {
      res = await fetch(classified.url, { redirect: "error", signal: AbortSignal.timeout(5000) });
    } catch (err) {
      refused(
        "http_catalog_failed",
        `Loopback catalog fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        { locator },
        { analysis: "engine-failure" },
      );
    }
    if (!res.ok) {
      refused("http_catalog_failed", `Loopback catalog HTTP ${res.status}`, { locator, status: res.status }, { analysis: "engine-failure" });
    }
    const text = await res.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
      refused("catalog_too_large", "Catalog exceeds 1MiB", { locator });
    }
    return { text, locator, transport: "loopback-http-json" };
  }

  const resolved = isAbsolute(locator) ? locator : resolve(process.cwd(), locator);
  let text;
  try {
    text = readFileSync(resolved, "utf8");
  } catch (err) {
    refused("catalog_unreadable", `Cannot read catalog file ${resolved}`, {
      path: resolved,
      error: err instanceof Error ? err.message : String(err),
    }, { analysis: "engine-failure" });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    refused("catalog_too_large", "Catalog exceeds 1MiB", { locator: resolved });
  }
  return { text, locator: resolved, transport: "file" };
}

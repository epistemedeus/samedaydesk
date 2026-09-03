import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonSchema } from "./validateJsonSchema.mjs";
import { feedIncludesEveryGreenRoute } from "./generateVerifiedFeed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const VERIFIED_SCHEMA_PATH = path.join(here, "../public/x402/verified.schema.json");

export function loadVerifiedSchema() {
  return JSON.parse(readFileSync(VERIFIED_SCHEMA_PATH, "utf8"));
}

export function validateVerifiedFeed(feed) {
  const errors = validateJsonSchema(feed, loadVerifiedSchema());
  if (errors.length) {
    throw new Error(`verified feed schema errors:\n${errors.join("\n")}`);
  }
  if (!feedIncludesEveryGreenRoute(feed)) {
    throw new Error("verified feed is missing a green conformance-registry route");
  }
  return feed;
}

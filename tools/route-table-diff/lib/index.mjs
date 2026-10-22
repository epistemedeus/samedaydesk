import { loadCatalogDocument } from "./catalog.mjs";
import {
  JOURNEY_AFTER,
  JOURNEY_BEFORE,
  LATER_BINDINGS,
  SAMPLE_AFTER,
  SAMPLE_BEFORE,
} from "./constants.mjs";
import { diffRouteTables } from "./diff.mjs";
import { createDefaultAdapters, isHttpLocator, loadRawCatalog } from "./io.mjs";
import { formatMarkdown } from "./report.mjs";
import { refused } from "./errors.mjs";

export { RouteDiffError, toPublicError } from "./errors.mjs";
export { loadCatalogDocument } from "./catalog.mjs";
export { diffRouteTables } from "./diff.mjs";
export { formatMarkdown } from "./report.mjs";
export { LATER_BINDINGS, SOURCE_PIN, PUBLIC_SHELL_PATHS } from "./constants.mjs";
export { contentHash, tableDigest } from "./digest.mjs";

function transportClass(locator, catalog) {
  if (isHttpLocator(locator)) return "local-runtime";
  if (catalog.sample) return "fixture";
  return "caller";
}

export async function runRouteDiff(options = {}) {
  const adapters = createDefaultAdapters(options.adapters);
  if (options.rewriteHomepage) {
    refused("homepage_rewrite_refused", "Claiming homepage rewrite is refused. This job never writes index.html or spa-route-shells.js.");
  }

  const example = options.example === true;
  const beforeLocator = example ? SAMPLE_BEFORE : options.before;
  const afterLocator = example ? SAMPLE_AFTER : options.after;
  if (!beforeLocator || !afterLocator) {
    refused("missing_catalog", "Provide --before and --after JSON locators, or --example for the labeled SAMPLE pair.");
  }
  if (example && options.published) {
    refused("sample_not_published_route_table", "SAMPLE catalogs are labeled fixtures, not the published SDS route table.");
  }

  const beforeRaw = await loadRawCatalog(beforeLocator, adapters);
  const afterRaw = await loadRawCatalog(afterLocator, adapters);
  const loadOpts = { published: options.published === true, rewriteHomepage: options.rewriteHomepage === true };
  const before = loadCatalogDocument(beforeRaw, beforeLocator, loadOpts);
  const after = loadCatalogDocument(afterRaw, afterLocator, loadOpts);

  const diff = diffRouteTables(before, after, {
    example,
    beforeClass: transportClass(beforeLocator, before),
    afterClass: transportClass(afterLocator, after),
  });
  diff.locators = { before: beforeLocator, after: afterLocator };
  diff.laterBindings = LATER_BINDINGS;
  diff.nonsettling = true;
  diff.paid = false;
  diff.settled = false;

  const markdown = formatMarkdown(diff);
  if (options.outDir) {
    const written = adapters.writeOutputs(options.outDir, diff, markdown);
    diff.outDir = written.dir;
    diff.outputs = ["route-diff.json", "route-diff.md"];
  }
  diff.markdown = markdown;
  return diff;
}

export const EXAMPLE_LOCATORS = Object.freeze({
  before: SAMPLE_BEFORE,
  after: SAMPLE_AFTER,
  journeyBefore: JOURNEY_BEFORE,
  journeyAfter: JOURNEY_AFTER,
});

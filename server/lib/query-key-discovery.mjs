import { QUERY_KEY_CONSUMER, queryKeyReuseMarkdown } from "./query-key-caller.mjs";

// The collection is a public action only under the existing reviewed read profile.
// Offline runner facts remain useful without activating that optional service.
export const publicAcceptedWork = (env = process.env) => env.CONTRIBUTOR_JOURNEY_MODE === "live" &&
  env.CONTRIBUTOR_JOURNEY_INSTALLED === "1" && env.CONTRIBUTOR_JOURNEY_PUBLIC_READS === "1" &&
  /^review_[A-Za-z0-9_.:-]{8,120}$/.test(env.CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF || "");

export function queryKeyDiscovery(env = process.env) {
  if (publicAcceptedWork(env)) return QUERY_KEY_CONSUMER;
  const { acceptedWork, ...offline } = QUERY_KEY_CONSUMER;
  void acceptedWork;
  return offline;
}

export function queryKeyDiscoveryMarkdown(env = process.env) {
  if (publicAcceptedWork(env)) return queryKeyReuseMarkdown();
  const { runner, apply, source } = QUERY_KEY_CONSUMER;
  return ["", "## Use query-key locally", "",
    `- Download ${runner.archive}, or the same archive at ${runner.alternateArchive}.`,
    `- Verify ${runner.bytes} bytes and SHA-256 ${runner.sha256} before extracting.`,
    `- Run the bundled example: \`${apply}\`.`,
    `- Source: ${source.repository} at ${source.commit}, path ${source.path}.`, ""].join("\n");
}

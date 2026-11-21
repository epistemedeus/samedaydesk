import { githubSentinel, tickSentinel } from "../lib/care-sentinel.js";
import { openCareStore } from "../lib/care-store.js";

if (process.env.SDS_PRIVATE_PREVIEW === "1" || process.env.SDS_CARE_SENTINEL_WORKER !== "1" ||
    !process.env.SDS_CARE_GITHUB_ACTIONS_TOKEN) throw new Error("The Sentinel worker is not enabled on this host.");
const store = openCareStore();
if (!store) throw new Error("Set up the care database before starting the Sentinel worker.");
try {
  const result = await tickSentinel({ store, github: githubSentinel({ token: process.env.SDS_CARE_GITHUB_ACTIONS_TOKEN }),
    orderId: process.env.SDS_CARE_SENTINEL_ORDER, spec: process.env.SDS_CARE_SENTINEL_PACKAGE });
  console.log(result);
  if (result.includes("review") || result.includes("mismatch")) process.exitCode = 1;
} finally { await store.close(); }

import { writeJson } from "./kit.mjs";
import { EXPERIMENT_ROOT, loadCatalog } from "./catalog.mjs";
import { join } from "node:path";

export function composePublishedCatalog() {
  const cat = loadCatalog();
  const published = {
    schema: "h6d.real-consumers.catalog.v1",
    assignment: cat.assignment,
    usefulJobs: cat.usefulJobs,
    baselinePin: cat.baselinePin,
    purchaseAuthority: false,
    schedulerDaemon: false,
    migrations: cat.migrations,
    jobs: cat.consumers.map((c) => ({
      id: c.id,
      family: c.family,
      jobId: c.jobId,
      repo: c.repo,
      path: c.path,
      ready: c.ready,
      testsPass: c.testsPass,
      ownedPath: `experiments/wave6/h6d-real-consumers/consumers/${c.id}/`,
      migrationEquivalent: c.migration?.equivalent === true,
      source: c.result?.source || c.acquisition || null,
    })),
    counts: cat.counts,
  };
  const out = join(EXPERIMENT_ROOT, "catalog", "catalog.json");
  writeJson(out, published);
  return { out, published };
}

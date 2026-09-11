import { D01_CLI, FIRST_OFFER, PUBLIC_CATALOG_REL, PUBLIC_DISCOVERY_REL } from "./repo.mjs";
import { parseJsonStdout, runNode } from "./spawn.mjs";
import { httpGetJson } from "./public-http.mjs";

export function listPaidOffers() {
  const proc = runNode([D01_CLI, "list"]);
  const parsed = parseJsonStdout(proc);
  return { proc, parsed };
}

export async function discoverOffer(origin, jobId = FIRST_OFFER) {
  const catalog = await httpGetJson(origin, PUBLIC_CATALOG_REL);
  const discovery = await httpGetJson(origin, PUBLIC_DISCOVERY_REL);
  const listed = listPaidOffers();
  const listBody = listed.parsed.body;
  const catalogJobs = (catalog.body?.jobs || []).map((j) => (typeof j === "string" ? j : j.id));
  const listedJobs = listBody?.jobs || [];
  const catalogJob = (catalog.body?.jobs || []).find((j) => j.id === jobId) || null;
  const inCatalog = catalogJobs.includes(jobId);
  const inCli = listedJobs.includes(jobId);
  const inDiscovery = Array.isArray(discovery.body?.jobs) && discovery.body.jobs.includes(jobId);
  return {
    jobId,
    origin,
    catalog,
    discovery,
    listed,
    catalogJobs,
    listedJobs,
    advertised: Boolean(inCatalog && inCli && inDiscovery && catalogJob),
    requiredInputs: catalogJob?.requiredInputs || [],
    outputs: catalogJob?.outputs || [],
    purchaseAuthority: discovery.body?.purchaseAuthority === true,
    liveSettlement: listBody?.liveSettlement || null,
  };
}

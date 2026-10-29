import { ARCHIVE_SHA256, OFFER_ID } from "./constants.mjs";

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "manual" });
    const text = await response.text();
    return { url, status: response.status, bytes: text.length, body: text.slice(0, 200000) };
  } catch (error) {
    return { url, status: null, error: error.name === "AbortError" ? "timeout" : "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeRemote() {
  const sums = await get("https://neomorphic.io/downloads/capability-preflight/SHA256SUMS");
  const h15 = await get("https://neomorphic.io/api/trials/bounty-economics-evaluation.json");
  const bounties = await get("https://neomorphic.io/api/bounties.json");
  const kernel = await get("https://neomorphic.io/v1/tasks");
  let h15Status = null;
  if (h15.status === 200) {
    try {
      const json = JSON.parse(h15.body);
      h15Status = {
        id: json.id,
        acceptsSubmissions: json.acceptsSubmissions,
        machineStatus: json.machineStatus ?? json.lifecycle?.machineStatus ?? null,
        nextAction: json.nextAction ?? json.lifecycle?.nextAction ?? null,
      };
    } catch {
      h15Status = { parse: false };
    }
  }
  return {
    schema: "neomorphic.contributor-reuse-trial.remote.v1",
    offerId: OFFER_ID,
    contacted: false,
    paid: false,
    capabilityPreflightSums: {
      status: sums.status,
      pinPresent: typeof sums.body === "string" && sums.body.includes(ARCHIVE_SHA256),
    },
    h15: { status: h15.status, ...h15Status, historicalSlotsReopened: false },
    bounties: {
      status: bounties.status,
      thisOfferPublished: typeof bounties.body === "string" && bounties.body.includes(OFFER_ID),
    },
    hostedClaimApi: {
      url: kernel.url,
      status: kernel.status,
      error: kernel.error ?? null,
      enrollment: "unavailable",
    },
  };
}

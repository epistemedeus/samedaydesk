export const SITES = Object.freeze({
  samedaydesk: Object.freeze({
    id: "samedaydesk",
    origin: "https://samedaydesk.com",
    brand: "SameDayDesk",
  }),
  "ein-llc": Object.freeze({
    id: "ein-llc",
    origin: "https://ein.llc",
    brand: "EIN.LLC",
  }),
  "neomorphic-io": Object.freeze({
    id: "neomorphic-io",
    origin: "https://neomorphic.io",
    brand: "Neomorphic",
  }),
});

export function resolveSite(value) {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  const site = SITES[key];
  if (!site) {
    return { ok: false, message: "site must be samedaydesk, ein-llc, or neomorphic-io" };
  }
  return { ok: true, site };
}

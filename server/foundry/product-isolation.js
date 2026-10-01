export const PRODUCT_DATA_PROJECT_REF = "arvmcttdegqwiwdaembr";
export const PRODUCT_DATA_HOST = `${PRODUCT_DATA_PROJECT_REF}.supabase.co`;
export const REUSE_CLASS = "correspondence_reuses_product_data_service";

function projectRefFromHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  const direct = host.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (direct && direct[1] !== "db") return direct[1];
  const db = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (db) return db[1];
  return null;
}

export function supabaseProjectRef(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return projectRefFromHost(new URL(text).hostname);
  } catch {
    return null;
  }
}

function refsFor(options = {}) {
  const refs = new Set([PRODUCT_DATA_PROJECT_REF]);
  const fromSupabase = supabaseProjectRef(options.supabaseUrl);
  if (fromSupabase) refs.add(fromSupabase);
  return refs;
}

export function isolationSignals(databaseUrl, options = {}) {
  const text = String(databaseUrl || "").trim();
  if (!text) return [];
  const signals = [];
  const lower = text.toLowerCase();
  const refs = refsFor(options);
  for (const ref of refs) {
    if (lower.includes(ref)) {
      signals.push(ref === PRODUCT_DATA_PROJECT_REF ? "product_project_ref" : "supabase_url_project_ref");
    }
  }
  try {
    const parsed = new URL(text);
    const host = parsed.hostname.toLowerCase();
    const user = decodeURIComponent(parsed.username || "").toLowerCase();
    if (host === PRODUCT_DATA_HOST || host === `db.${PRODUCT_DATA_PROJECT_REF}.supabase.co`) {
      signals.push("product_host");
    }
    if (host.endsWith(".pooler.supabase.com") && [...refs].some((ref) => user.includes(ref) || lower.includes(ref))) {
      signals.push("pooler_user");
    }
    const supabaseRef = supabaseProjectRef(options.supabaseUrl);
    if (supabaseRef && (host === `${supabaseRef}.supabase.co` || host === `db.${supabaseRef}.supabase.co` || user.includes(supabaseRef))) {
      signals.push("supabase_url_host");
    }
  } catch {
    // A non-URL value can still carry the project ref. The includes check covers it.
  }
  return [...new Set(signals)];
}

export function reusesProductDataService(databaseUrl, options = {}) {
  return isolationSignals(databaseUrl, options).length > 0;
}

function textCandidates(metadata) {
  const service = metadata?.correspondenceDataService || {};
  const env = metadata?.env || {};
  return [
    metadata?.correspondenceDatabaseUrl,
    service.url,
    service.databaseUrl,
    service.connectionString,
    service.host,
    env.CORRESPONDENCE_DATABASE_URL,
    env.DATABASE_URL,
    metadata?.productDataService?.correspondenceUrl,
  ];
}

export function correspondenceReuseSignals(metadata) {
  if (!metadata || typeof metadata !== "object") return [];
  const signals = [];
  const supabaseUrl = metadata?.env?.SUPABASE_URL || metadata?.supabaseUrl || null;
  for (const candidate of textCandidates(metadata)) {
    signals.push(...isolationSignals(candidate, { supabaseUrl }));
  }
  const productHost = String(metadata?.productDataService?.host || "").toLowerCase();
  const correspondenceHost = String(metadata?.correspondenceDataService?.host || "").toLowerCase();
  if (productHost && correspondenceHost && productHost === correspondenceHost) signals.push("same_host");
  if (metadata?.productDataService?.reusedForCorrespondence === true) signals.push("reused_for_correspondence");
  if (metadata?.correspondenceDataService?.separateFromProduct === false) signals.push("not_separate_from_product");
  if (metadata?.correspondenceDataService?.reusedProductDataService === true) signals.push("reused_product_data_service");
  return [...new Set(signals)];
}

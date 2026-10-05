import { isIP } from "node:net";
import { X509Certificate } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertPrivateLocation, coded, readPrivateBytes } from "./private-paths.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export function assertCaPath(file) { return assertPrivateLocation(String(file || ""), repoRoot); }

export function readCaStatus(env = process.env) {
  const configured = String(env.CORRESPONDENCE_PGSSL_CA_FILE || "").trim();
  if (!configured) return { required: false, ok: true, file: "" };
  try {
    const file = assertCaPath(configured);
    const pem = readPrivateBytes(file, { repoRoot, limit: 1024 * 1024 }).toString("utf8");
    const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!certificates?.length || certificates.some(cert => !new X509Certificate(cert).ca)) throw coded("pg_ca_unreadable");
    return { required: true, ok: true, file };
  } catch {
    return { required: true, ok: false, file: "", reason: "pg_ca_unreadable" };
  }
}

export function appendSslRootCert(connectionString, caFile) {
  let url;
  try { url = new URL(connectionString); } catch { throw coded("pg_tls_url_invalid"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw coded("pg_tls_url_invalid");
  // A configured CA is never silently ignored by a weaker mode or libpq compatibility.
  if (url.searchParams.getAll("sslmode").length !== 1 || url.searchParams.get("sslmode") !== "verify-full"
      || url.searchParams.has("uselibpqcompat") || url.searchParams.has("ssl")) throw coded("pg_tls_verify_full_required");
  // This locked pg version omits TLS servername for IP hosts. Require DNS so
  // Node checks the certificate against the actual connection hostname.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || isIP(hostname) || url.searchParams.has("host")) throw coded("pg_tls_hostname_required");
  const existing = url.searchParams.getAll("sslrootcert");
  if (existing.length > 1 || (existing.length === 1 && existing[0] !== caFile)) throw coded("pg_ca_conflict");
  url.searchParams.set("sslrootcert", caFile);
  return url.toString();
}

// Apply only at the foundry URL boundary. Never patch pg or mutate product/Pulse pools.
export function verifiedFoundryDatabaseUrl(connectionString, env = process.env) {
  const status = readCaStatus(env);
  if (status.file && (env.NODE_TLS_REJECT_UNAUTHORIZED === "0" || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")) throw coded("pg_tls_verification_disabled");
  if (!status.ok) throw coded(status.reason);
  return status.file ? appendSslRootCert(connectionString, status.file) : connectionString;
}

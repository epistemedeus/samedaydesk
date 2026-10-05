import { statSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const CA_ENV = "CORRESPONDENCE_PGSSL_CA_FILE";

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function assertCaPath(file) {
  const resolved = path.resolve(String(file || ""));
  if (resolved.split(path.sep).includes("public_html")) throw coded("pg_ca_path_refused");
  return resolved;
}

export function readCaStatus(env = process.env) {
  const configured = String(env[CA_ENV] || "").trim();
  if (!configured) return { required: false, ok: true, file: "" };
  try {
    const file = assertCaPath(configured);
    const stat = statSync(file);
    if (!stat.isFile() || stat.size < 32 || stat.size > 1024 * 1024) throw coded("pg_ca_unreadable");
    return { required: true, ok: true, file };
  } catch (error) {
    return { required: true, ok: false, file: "", reason: error.code || "pg_ca_unreadable" };
  }
}

export function appendSslRootCert(connectionString, caFile) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return connectionString;
  if (url.searchParams.get("sslmode") !== "verify-full") return connectionString;
  if (url.searchParams.has("sslrootcert")) return connectionString;
  url.searchParams.set("sslrootcert", caFile);
  return url.toString();
}

let wrapped = false;

export function installVerifiedPgTls() {
  if (wrapped) return readCaStatus();
  const Original = pg.Pool;
  function VerifiedPool(config) {
    const status = readCaStatus();
    if (status.required && !status.ok) throw coded(status.reason || "pg_ca_unreadable");
    if (status.file && config && typeof config === "object" && typeof config.connectionString === "string") {
      config = { ...config, connectionString: appendSslRootCert(config.connectionString, status.file) };
    } else if (status.file && typeof config === "string") {
      config = appendSslRootCert(config, status.file);
    }
    return new Original(config);
  }
  VerifiedPool.prototype = Original.prototype;
  Object.setPrototypeOf(VerifiedPool, Original);
  pg.Pool = VerifiedPool;
  wrapped = true;
  return readCaStatus();
}

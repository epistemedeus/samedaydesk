import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONSUMERS,
  FORBIDDEN_INSTALLATION_STATUSES,
  FORBIDDEN_RUNTIME_STATUSES,
  INSTALLATION_STATUS,
  INTERFACE_SCHEMA,
  RUNTIME_EXECUTION_STATUS,
  TOOLS,
  resolveConsumer,
} from "./pins.mjs";
import { assertHonestStatuses } from "./status.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_ROOT = join(here, "../manifests");

const CLAIM_RE = /\binstallation passed\b|\binstalled successfully\b|\bruntime execution (?:passed|succeeded|complete)\b/i;

export function loadConsumerInterface(consumer = "dify") {
  const resolved = resolveConsumer(consumer);
  if (!resolved.ok) return resolved;
  const directory = join(MANIFEST_ROOT, resolved.consumer.key);
  const statusPath = join(directory, "interface-status.json");
  let status;
  try {
    status = JSON.parse(readFileSync(statusPath, "utf8"));
  } catch {
    return { ok: false, message: `cannot read ${resolved.consumer.key} interface-status.json` };
  }
  if (status.schema !== INTERFACE_SCHEMA) {
    return { ok: false, message: "interface status uses an unexpected schema" };
  }
  const honest = assertHonestStatuses({
    installationStatus: status.installationStatus,
    runtimeExecutionStatus: status.runtimeExecutionStatus,
  });
  if (!honest.ok) return honest;
  const files = listManifestFiles(directory);
  const texts = files.map((relative) => ({
    relative,
    text: readFileSync(join(directory, relative), "utf8"),
  }));
  const claim = texts.find((file) => CLAIM_RE.test(file.text) || containsForbiddenStatus(file.text));
  if (claim) {
    return {
      ok: false,
      message: `manifest ${claim.relative} claims installation or runtime execution`,
    };
  }
  const missing = (status.tools || []).filter((tool) => !TOOLS.includes(tool));
  if (missing.length) {
    return { ok: false, message: "interface status lists an unsupported tool" };
  }
  return {
    ok: true,
    consumer: resolved.consumer,
    status,
    files: files.map((relative) => join("manifests", resolved.consumer.key, relative)),
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
  };
}

export function loadAllInterfaces() {
  const loaded = Object.keys(CONSUMERS).map((key) => loadConsumerInterface(key));
  const failed = loaded.find((item) => !item.ok);
  if (failed) return failed;
  return {
    ok: true,
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
    consumers: loaded,
  };
}

function listManifestFiles(directory) {
  const out = [];
  const walk = (relative = "") => {
    const current = relative ? join(directory, relative) : directory;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(next);
      else out.push(next);
    }
  };
  walk();
  return out.sort();
}

function containsForbiddenStatus(text) {
  const lower = text.toLowerCase();
  return FORBIDDEN_INSTALLATION_STATUSES.some((value) => lower.includes(`installationstatus": "${value}"`))
    || FORBIDDEN_RUNTIME_STATUSES.some((value) => lower.includes(`runtimeexecutionstatus": "${value}"`));
}

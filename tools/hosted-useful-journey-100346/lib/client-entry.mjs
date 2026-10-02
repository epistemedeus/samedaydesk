import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { JourneyError, readFileBounded, parseJson } from "./budget.mjs";

export const CLIENT_VERSION = "0.1.1";
const name = `hosted-useful-journey-${CLIENT_VERSION}.tar.gz`;
const directory = new URL(`../successors/${CLIENT_VERSION}/`, import.meta.url);

export async function clientEntry(budget) {
  const release = parseJson(await readFileBounded(fileURLToPath(new URL("release.json", directory)), budget, 8192));
  if (release.version !== CLIENT_VERSION || release.archive !== name || !/^[a-f0-9]{64}$/.test(release.sha256)
      || !Number.isInteger(release.bytes) || release.bytes < 1 || release.bytes > 65_536) throw new JourneyError(503, "client_release_unavailable");
  return { ...release, archiveUrl: "/api/hosted-useful/client/archive", evaluationRoute: "/api/hosted-useful/evaluate",
    admission: "existing project-scoped grant and enrolled correspondence Postgres",
    publicationVerified: false, productionReady: false };
}

export async function clientArchive(budget) {
  const entry = await clientEntry(budget);
  const bytes = await readFileBounded(fileURLToPath(new URL(name, directory)), budget);
  if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new JourneyError(503, "client_release_mismatch");
  return bytes;
}

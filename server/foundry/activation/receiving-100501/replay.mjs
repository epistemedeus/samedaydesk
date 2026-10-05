// Receiving-only replay: always creates and destroys its own PostgreSQL cluster.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDisposablePg } from "../../../scripts/fixtures/disposable-pg.mjs";

const mode = process.argv[2];
if (!["correspondence", "managed-install"].includes(mode)) throw new Error("replay mode required");
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const cluster = await startDisposablePg();
let directory;
try {
  const env = { PATH: process.env.PATH || "", HOME: process.env.HOME || "", LANG: "C" };
  const script = mode === "correspondence" ? "test:correspondence-mount" : "build:managed-foundry-install";
  if (mode === "correspondence") env.CORRESPONDENCE_TEST_DATABASE_URL = cluster.url;
  else {
    directory = await mkdtemp(path.join(tmpdir(), "sds-managed-install-"));
    const examples = path.join(root, "vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry");
    Object.assign(env, {
      CORRESPONDENCE_DATABASE_URL: cluster.url,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      FOUNDRY_PRIVATE_DIR: directory,
      FOUNDRY_HOST_PROFILE_JSON: await readFile(path.join(examples, "host-profile.example.json"), "utf8"),
      FOUNDRY_PRIVATE_PROFILE_JSON: await readFile(path.join(examples, "private-profile.example.json"), "utf8"),
      FOUNDRY_PARTICIPATION_KEY: "managed-install-disposable-fixture-32-characters",
    });
  }
  const child = spawn("npm", ["run", script], { cwd: root, env, stdio: ["ignore", "inherit", "inherit"] });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
} finally {
  await cluster.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
}

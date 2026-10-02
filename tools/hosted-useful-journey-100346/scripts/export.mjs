#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const version = "0.1.0";
const name = `hosted-useful-journey-${version}`;
const dir = await mkdtemp(join(tmpdir(), "sds-useful-export-"));
const out = join(root, "successors", version);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const files = ["LICENSE", "COLD-CLIENT.md", "client.mjs", "cold-client.mjs", "lib/budget.mjs",
  "examples/page-watch.json", "examples/issue-brief.json", "examples/useful-negative.json"];
try {
  const kit = join(dir, name); await mkdir(kit);
  const inventory = [];
  for (const file of files) {
    const bytes = await readFile(join(root, file));
    if (bytes.length > 65_536) throw Error("export source bound exceeded");
    await mkdir(dirname(join(kit, file)), { recursive: true });
    await writeFile(join(kit, file), bytes);
    inventory.push({ path: file, bytes: bytes.length, sha256: digest(bytes), license: "MIT" });
  }
  // Bind executable/client/example source. Package-authored instructions are
  // separately hashed in inventory; later receiving docs do not retarget bytes.
  let sourceHead;
  try {
    // A transport may publish the exact native tree in another commit wrapper.
    // Preserve the sealed version's native provenance on a fresh receiving clone.
    const sealed = JSON.parse(await readFile(join(out, "release.json"), "utf8"));
    if (sealed.version !== version || !/^[a-f0-9]{40}$/.test(sealed.sourceHead)) throw Error("invalid sealed source pin");
    sourceHead = sealed.sourceHead;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    sourceHead = execFileSync("git", ["log", "-1", "--format=%H", "--", ...files.filter(file => file !== "COLD-CLIENT.md").map(file => `tools/hosted-useful-journey-100346/${file}`)], { cwd: repo, encoding: "utf8", timeout: 2000 }).trim();
  }
  await writeFile(join(kit, "package.json"), `${JSON.stringify({ name: "@samedaydesk/hosted-useful-journey-client", version, private: true,
    type: "module", license: "MIT", engines: { node: "22.x" }, scripts: { start: "node cold-client.mjs" } }, null, 2)}\n`);
  await writeFile(join(kit, "SOURCE-NOTICE.txt"), `MIT minimal client. Native implementation source ${sourceHead}.\nExisting recipe/runtime/store source stays on the received SameDayDesk host.\nExamples are QA, not customer demand; no payment/public write.\nPublication and production enrollment unverified.\n`);
  await writeFile(join(kit, "inventory.json"), `${JSON.stringify({ sourceHead, files: inventory }, null, 2)}\n`);
  const archiveName = `${name}.tar.gz`;
  const archivePath = join(dir, archiveName);
  execFileSync("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf", archivePath, "-C", dir, name], { timeout: 10_000, maxBuffer: 4096 });
  const archive = await readFile(archivePath);
  const release = { schema: "samedaydesk.hosted-useful-client-release.v1", version, sourceHead, archive: archiveName,
    bytes: archive.length, sha256: digest(archive), license: "MIT", node: "22.x", dependencies: [],
    publicationVerified: false, productionReady: false, outsideUsefulUse: "unobserved", settledPayment: "unobserved" };
  await mkdir(out, { recursive: true });
  try {
    const existing = await readFile(join(out, archiveName));
    if (!existing.equals(archive)) throw Error("sealed export exists with different bytes; create a successor version");
  } catch (error) { if (error.code !== "ENOENT") throw error; await writeFile(join(out, archiveName), archive, { flag: "wx" }); }
  await writeFile(join(out, "release.json"), `${JSON.stringify(release, null, 2)}\n`);
  await writeFile(join(out, "SHA256SUMS"), `${release.sha256}  ${archiveName}\n`);
  await writeFile(join(out, "LICENSE"), await readFile(join(root, "LICENSE")));
  process.stdout.write(`${JSON.stringify(release)}\n`);
} finally { await rm(dir, { recursive: true, force: true }); }

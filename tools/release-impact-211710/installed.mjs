import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { SUPPORT, INSTALLED_SCHEMA } from "./support.mjs";
import { requireEvidence, seal, sha256Hex, validTime } from "./evidence.mjs";
import { observationFields, runtime, snapshot } from "./source.mjs";

const execute = promisify(execFile);
export async function captureInstalled({ repo, ref, clock }) {
  requireEvidence(validTime(clock), "installation_clock_invalid");
  const installedSource = await snapshot(repo, ref);
  requireEvidence(installedSource.source.blob === SUPPORT.acceptedBlob && installedSource.source.sha256 === SUPPORT.acceptedSha256, "accepted_repair_not_installed");
  const sourcePath = resolve(repo, SUPPORT.sourcePath);
  requireEvidence(sha256Hex(await readFile(sourcePath)) === installedSource.source.sha256, "installed_worktree_differs_from_ref");
  const observedRuntime = await runtime();
  requireEvidence(/^v22\./.test(observedRuntime.node), "installed_runtime_not_supported");
  const dir = await mkdtemp(join(tmpdir(), "release-impact-install-"));
  const probes = [];
  try {
    const payload = Buffer.from("Root-owned installed archive acquisition probe\n");
    const input = join(dir, "input.bin"); await writeFile(input, payload, { flag: "wx" });
    const args = [sourcePath, "--from", input, "--expected-bytes", String(payload.length), "--expected-sha256", sha256Hex(payload), "--dest", join(dir, "accepted.bin")];
    const run = async (name, command, argv, expectedExit) => {
      let code = 0, stdout = "", stderr = "";
      try { ({ stdout, stderr } = await execute(command, argv, { encoding: "utf8", timeout: 4000, maxBuffer: 16384 })); }
      catch (error) { code = error.code; stdout = error.stdout || ""; stderr = error.stderr || ""; }
      requireEvidence(code === expectedExit, "installed_predicate_probe_failed");
      const clean = text => text.replaceAll(dir, "<disposable-probe>").replaceAll(resolve(repo), "<installed-root>").replaceAll(process.execPath, "<node-runtime>");
      const probe = { name, command: [command === process.execPath ? "node" : command, ...argv].map(clean), exitCode: code, stdout: clean(stdout), stderr: clean(stderr) };
      probes.push(probe); return stdout;
    };
    const good = JSON.parse(await run("valid_local_archive", process.execPath, args, 0));
    requireEvidence(good.ok === true && good.executed === false && sha256Hex(await readFile(join(dir, "accepted.bin"))) === sha256Hex(payload), "installed_valid_acquisition_failed");
    const badArgs = [...args]; badArgs[badArgs.indexOf("--expected-sha256") + 1] = "0".repeat(64); badArgs[badArgs.indexOf("--dest") + 1] = join(dir, "refused.bin");
    const bad = JSON.parse(await run("wrong_digest_local_archive", process.execPath, badArgs, 1));
    requireEvidence(bad.ok === false && bad.code === "wrong-digest" && bad.extracted === false && bad.executed === false && bad.destExists === false, "installed_refusal_failed");
    const chain = await run("shell_stops_on_refusal", "bash", ["-c", 'if "$@"; then printf "CHAIN-CONTINUED"; else exit 7; fi', "archive-chain", process.execPath, ...badArgs], 7);
    requireEvidence(!chain.includes("CHAIN-CONTINUED"), "installed_shell_chain_continued");
  } finally { await rm(dir, { recursive: true, force: true }); }
  const payload = { fields: observationFields(installedSource, observedRuntime) };
  return seal({ schema: INSTALLED_SCHEMA, repairId: SUPPORT.repairId, repository: SUPPORT.repository,
    installation: { status: "verified_owner_qa", kind: "local_source_cli", owner: "Root", relationship: "owner_qa",
      ref, capturedAt: clock, package: { name: "samedaydesk", version: installedSource.packageVersion, repairVersion: `source@${SUPPORT.repairRef}` },
      source: installedSource, runtime: observedRuntime, predicate: SUPPORT.predicate, probes,
      customerInstallation: "unknown", hostedInstallation: "unverified", priorAcceptanceReceipt: SUPPORT.priorReceipt },
    coverage: { sourcePaths: [SUPPORT.sourcePath, SUPPORT.manifestPath], dependencyNames: [...SUPPORT.dependencies],
      task: "archive acquisition refusal and shell-chain behavior", probeNames: probes.map(p => p.name), installedStateComplete: true },
    prior: { schema: "samedaydesk.recurring-job-prior.v1", recipeId: "source-change-alert", createdAt: clock, sequence: 1,
      immutable: true, sha256: sha256Hex(payload), payload, payment: { attempted: false } },
  });
}

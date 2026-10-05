import { npmCli, withoutHostUtilities } from "./namespace.mjs";

const mode = process.argv[2];
if (!["build", "cold"].includes(mode)) throw new Error("replay mode required");
const npm = await npmCli();
const code = mode === "build"
  ? `import {spawn} from 'node:child_process';const c=spawn(process.execPath,[${JSON.stringify(npm)},'run','build:managed-foundry'],{stdio:'inherit'});process.exitCode=await new Promise(r=>c.once('close',code=>r(code??1)));`
  : `await import('./server/foundry/activation/cold-job.mjs');const {installation}=await import('./vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/supervisor.mjs');console.log(JSON.stringify({kind:'runtime-provenance',runtime:installation()}));`;
const result = await withoutHostUtilities(["--input-type=module", "-e", code], { fresh: true, timeoutMs: 240000 });
// Namespace failures print only a fixed code; child stderr is never retained.
if (result.reason || result.code !== 0) throw new Error(result.reason || "namespace_replay_failed");
const observations = result.stdout.split("\n").filter(line => line.startsWith("{")).map(line => JSON.parse(line));
if (mode === "build") {
  const probe = observations.find(o => o.probe === "managed-node");
  if (!probe?.ok || probe.python3 || probe.prlimit || !probe.bundledPython || !probe.osLimitsEnforced || !probe.pidPreserved) throw new Error("namespace_build_evidence_missing");
} else {
  const cold = observations.find(o => o.serviceClass === "local-disposable");
  if (!cold?.ok || cold.hostingerMeasured || cold.phases.inputVariants.length !== 3) throw new Error("namespace_cold_evidence_missing");
}
process.stdout.write(JSON.stringify({ mode, namespace: true, optionalHostUtilities: { systemPython3: false, prlimit: false },
  exit: result.code, hostingerMeasured: false, observations })+"\n");

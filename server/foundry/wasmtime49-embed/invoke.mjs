import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bytesHash, hash, PROFILE, SCHEMA, validateArtifact, validateBinding, encodeInput, decodeOutput, copy, check } from "../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/contracts.mjs";
import { superviseProcess } from "../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/supervisor.mjs";
import { EMBED_PROFILE } from "./profile.mjs";

const binary = fileURLToPath(new URL("./bin/foundry-wasmtime49", import.meta.url));
const childSource = fileURLToPath(new URL("./child.c", import.meta.url));
const contractsSource = fileURLToPath(new URL("../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/contracts.mjs", import.meta.url));
const prlimit = "/usr/bin/prlimit";

export { superviseProcess };

export function osLimitMechanism() {
  return existsSync(prlimit) ? "prlimit-then-setrlimit" : "setrlimit-after-exec";
}

export function installation() {
  check(process.platform === "linux" && process.arch === "x64", "runtime platform");
  check(hash(PROFILE) === hash(EMBED_PROFILE), "embed profile was not installed");
  check(existsSync(binary), "embed binary missing");
  const pins = {
    profile: EMBED_PROFILE,
    node: process.version,
    binary: bytesHash(readFileSync(binary)),
    child: bytesHash(readFileSync(childSource)),
    adapter: bytesHash(readFileSync(fileURLToPath(import.meta.url))),
    contracts: bytesHash(readFileSync(contractsSource)),
    osLimitMechanism: osLimitMechanism(),
    wasi: false,
  };
  return { pins, runtimePin: hash(pins) };
}

export async function invoke({ artifact, moduleBytes, input, binding, signal, onSpawn }) {
  artifact = copy(artifact);
  moduleBytes = Buffer.from(moduleBytes);
  binding = copy(binding);
  validateArtifact(artifact, moduleBytes);
  validateBinding(binding, artifact);
  const runtime = installation();
  check(runtime.runtimePin === binding.runtimePin, "runtime binding mismatch");
  const inputBytes = encodeInput(artifact, input);
  const limits = artifact.limits;
  const childArgs = [
    `--as=${limits.addressSpaceBytes}`,
    `--cpu=${limits.cpuSeconds}`,
    `--stack=${limits.hostStackBytes}`,
    `--fsize=${limits.fileBytes}`,
    `--nofile=${limits.openFiles}`,
  ];
  const launch = existsSync(prlimit)
    ? () => spawn(prlimit, [
      `--as=${limits.addressSpaceBytes}:${limits.addressSpaceBytes}`,
      `--cpu=${limits.cpuSeconds}:${limits.cpuSeconds}`,
      `--stack=${limits.hostStackBytes}:${limits.hostStackBytes}`,
      `--fsize=${limits.fileBytes}:${limits.fileBytes}`,
      `--nofile=${limits.openFiles}:${limits.openFiles}`,
      "--core=0:0",
      "--",
      binary,
      ...childArgs,
    ], { env: { LANG: "C", LC_ALL: "C" }, cwd: "/", stdio: ["pipe", "pipe", "pipe"] })
    : () => spawn(binary, childArgs, { env: { LANG: "C", LC_ALL: "C" }, cwd: "/", stdio: ["pipe", "pipe", "pipe"] });
  const observation = await superviseProcess({
    launch,
    payload: {
      module: moduleBytes.toString("base64"),
      moduleDigest: artifact.module.digest,
      input: inputBytes.toString("base64"),
      limits,
    },
    limits,
    signal,
    onSpawn,
  });
  let output = null;
  let outputDigest = null;
  if (observation.status === "ok") {
    try {
      check(typeof observation.result.output === "string" && observation.result.output.length <= Math.ceil(limits.outputBytes / 3) * 4, "output encoding");
      const bytes = Buffer.from(observation.result.output, "base64");
      check(bytes.toString("base64") === observation.result.output, "output encoding");
      output = decodeOutput(artifact, bytes);
      outputDigest = bytesHash(bytes);
      const usage = observation.result.usage;
      for (const key of ["cpuMs", "peakRssBytes", "fuelUsed", "compileMs", "instantiateMs", "executeMs"]) {
        check(Number.isFinite(usage[key]) && usage[key] >= 0, "usage protocol");
      }
      check(usage.fuelUsed <= limits.fuel && usage.peakRssBytes <= limits.addressSpaceBytes, "usage bounds");
    } catch {
      observation.status = "invalid_output";
      output = null;
      outputDigest = null;
    }
  }
  const record = {
    schema: `${SCHEMA}.observation.v1`,
    binding,
    inputDigest: bytesHash(inputBytes),
    outputDigest,
    status: observation.status,
    code: observation.code,
    phase: observation.phase,
    phasesObserved: observation.phasesObserved,
    processIdentity: observation.processIdentity,
    termination: observation.termination,
    runtimePin: runtime.runtimePin,
    limits,
    usage: {
      wallMs: observation.wallMs,
      ...(observation.status === "ok" ? observation.result.usage : {
        cpuMs: null, peakRssBytes: null, fuelUsed: null, compileMs: null, instantiateMs: null, executeMs: null,
      }),
      cost: null,
    },
    observedAt: new Date().toISOString(),
    outcome: "observed_execution",
    compatibility: "unqualified",
  };
  return { output, observation: { ...record, id: hash(record) } };
}

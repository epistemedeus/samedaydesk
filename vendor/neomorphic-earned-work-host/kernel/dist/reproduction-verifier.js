import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { asEvidenceBuffer, digestSha256Hex, receivedEvidenceMatches } from "./evidence.js";
import { defaultVerifier, DEFAULT_VERIFIER_VERSION, } from "./verifier.js";
export const REPRODUCTION_VERIFIER_VERSION = "neomorphic.wave5.e18.reproduction-verifier.v1";
export const REPRODUCTION_SPEC_MARKER = "e18.specDigest:";
export const REPRODUCTION_RUNTIME_MARKER = "e18.runtimeDigest:";
export const SPEC_DIGEST_RE = /e18\.specDigest:(sha256:[a-f0-9]{64})/;
export const RUNTIME_DIGEST_RE = /e18\.runtimeDigest:(sha256:[a-f0-9]{64})/;
function isInsideRoot(root, candidate) {
    const rel = path.relative(root, candidate);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
function hostChildEnv() {
    const env = {};
    for (const key of ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL"]) {
        if (process.env[key])
            env[key] = process.env[key];
    }
    return env;
}
export function readBoundSpecDigest(summary) {
    if (typeof summary !== "string")
        return null;
    const match = summary.match(SPEC_DIGEST_RE);
    return match?.[1] ?? null;
}
export function readBoundRuntimeDigest(summary) {
    if (typeof summary !== "string")
        return null;
    const match = summary.match(RUNTIME_DIGEST_RE);
    return match?.[1] ?? null;
}
export function boundReproductionSummary(specDigest, runtimeDigest, prefix = "SDS52 historical workflow trial, not new bug discovery") {
    return `${prefix}. ${REPRODUCTION_SPEC_MARKER}${specDigest} ${REPRODUCTION_RUNTIME_MARKER}${runtimeDigest}`;
}
export function loadReproductionRuntime(config) {
    const root = realpathSync(config.root);
    if (!statSync(root).isDirectory()) {
        throw new Error("EARNED_WORK_REPRODUCTION_ROOT must be a directory");
    }
    const executable = realpathSync(config.executable);
    const specPath = realpathSync(config.specPath);
    if (!isInsideRoot(root, executable) || !isInsideRoot(root, specPath)) {
        throw new Error("reproduction executable and spec must live under EARNED_WORK_REPRODUCTION_ROOT");
    }
    if (!executable.endsWith("e18-repro.mjs")) {
        throw new Error("host-controlled reproduction executable must be e18-repro.mjs");
    }
    if (!existsSync(executable) || !statSync(executable).isFile()) {
        throw new Error("host-controlled reproduction executable is missing");
    }
    const specRun = spawnSync(process.execPath, [executable, "spec", "--file", specPath], {
        cwd: root,
        encoding: "utf8",
        timeout: Math.min(config.timeoutMs, 10_000),
        env: hostChildEnv(),
    });
    if (specRun.error) {
        throw new Error(`host reproduction spec executable failed to start: ${specRun.error.message}`);
    }
    if (specRun.status !== 0) {
        throw new Error(`host reproduction spec executable exited ${specRun.status}: ${specRun.stderr || specRun.stdout}`);
    }
    let specJson;
    try {
        specJson = JSON.parse(String(specRun.stdout || ""));
    }
    catch {
        throw new Error("host reproduction spec executable did not print JSON");
    }
    if (typeof specJson.specDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(specJson.specDigest)) {
        throw new Error("host reproduction specDigest missing or malformed");
    }
    if (typeof specJson.id !== "string" || !specJson.id.trim()) {
        throw new Error("host reproduction spec id missing");
    }
    const runtimeRun = spawnSync(process.execPath, [executable, "runtime-digest"], {
        cwd: root,
        encoding: "utf8",
        timeout: Math.min(config.timeoutMs, 10_000),
        env: hostChildEnv(),
    });
    if (runtimeRun.status !== 0) {
        throw new Error(`host reproduction runtime-digest exited ${runtimeRun.status}: ${runtimeRun.stderr || runtimeRun.stdout}`);
    }
    let runtimeJson;
    try {
        runtimeJson = JSON.parse(String(runtimeRun.stdout || ""));
    }
    catch {
        throw new Error("host reproduction runtime-digest did not print JSON");
    }
    if (typeof runtimeJson.runtimeDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(runtimeJson.runtimeDigest)) {
        throw new Error("host reproduction runtimeDigest missing or malformed");
    }
    if (!Array.isArray(runtimeJson.files) || runtimeJson.files.length === 0 || runtimeJson.files.length > 128 ||
        runtimeJson.files.some((file) => typeof file !== "string" || path.isAbsolute(file) ||
            file.split(/[\\/]/).some((part) => !part || part === "." || part === ".."))) {
        throw new Error("host reproduction runtime file manifest missing or unsafe");
    }
    return {
        root,
        specPath,
        executable,
        timeoutMs: config.timeoutMs,
        specDigest: specJson.specDigest,
        specId: specJson.id,
        runtimeDigest: runtimeJson.runtimeDigest,
        files: runtimeJson.files,
    };
}
function mapKernelResult(raw, fallbackReasons) {
    const body = raw && typeof raw === "object" ? raw : {};
    const kernel = body.kernel && typeof body.kernel === "object" ? body.kernel : body.verdict;
    const source = kernel && typeof kernel === "object" ? kernel : {};
    const outcome = source.outcome === "pass" || source.outcome === "fail" || source.outcome === "needs_review"
        ? source.outcome
        : "needs_review";
    const reasons = Array.isArray(source.reasons)
        ? source.reasons.map((row) => String(row))
        : fallbackReasons;
    const verifierVersion = typeof source.verifierVersion === "string" && source.verifierVersion
        ? source.verifierVersion
        : REPRODUCTION_VERIFIER_VERSION;
    return { outcome, verifierVersion, reasons };
}
function runHostVerify(runtime, evidencePath) {
    const ownsProcessGroup = process.platform !== "win32";
    const workDir = path.dirname(evidencePath);
    // Node 22's spawnSync uses the common spawn normalizer (including detached).
    // Keep this as a named options object because @types/node omits that property
    // from its narrower synchronous overload. The process test checks real exit.
    const options = {
        cwd: runtime.root,
        encoding: "utf8",
        timeout: runtime.timeoutMs,
        detached: ownsProcessGroup,
        env: { ...hostChildEnv(), TMPDIR: workDir, TMP: workDir, TEMP: workDir },
    };
    const result = spawnSync(process.execPath, [runtime.executable, "verify", "--submission", evidencePath, "--file", runtime.specPath], options);
    // The parent may time out while E18 is blocked in its own engine. Terminate
    // only this invocation's process group before removing its temporary root.
    if (ownsProcessGroup && result.pid > 0) {
        try {
            process.kill(-result.pid, "SIGKILL");
        }
        catch (error) {
            if (error.code !== "ESRCH") {
                return { outcome: "needs_review", verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                    reasons: ["could not stop the verifier's owned process group; execution is incomplete"] };
            }
        }
    }
    if (result.error) {
        return {
            outcome: "needs_review",
            verifierVersion: REPRODUCTION_VERIFIER_VERSION,
            reasons: [result.error.code === "ETIMEDOUT"
                    ? "host-controlled verifier timed out; incomplete execution is not a pass"
                    : `host-controlled verifier failed to start: ${result.error.message}`],
        };
    }
    if (result.signal === "SIGTERM" || result.status === null) {
        return {
            outcome: "needs_review",
            verifierVersion: REPRODUCTION_VERIFIER_VERSION,
            reasons: ["host-controlled verifier timed out or was killed; incomplete is not a pass"],
        };
    }
    try {
        const verdict = mapKernelResult(JSON.parse(String(result.stdout || "")), [
            `host-controlled verifier exited ${result.status} without kernel reasons`,
        ]);
        if (result.status !== 0 && verdict.outcome === "pass") {
            return {
                outcome: "needs_review",
                verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                reasons: [`host-controlled verifier exited ${result.status}; incomplete execution cannot authorize a pass`],
            };
        }
        return verdict;
    }
    catch {
        return {
            outcome: "needs_review",
            verifierVersion: REPRODUCTION_VERIFIER_VERSION,
            reasons: ["host-controlled verifier printed non-JSON; incomplete is not a pass"],
        };
    }
}
function stageReceivedEvidence(bytes) {
    const dir = mkdtempSync(path.join(tmpdir(), "ew-repro-evidence-"));
    const file = path.join(dir, "submission.json");
    writeFileSync(file, bytes);
    return { dir, file };
}
function currentRuntime(runtime) {
    try {
        // Re-read the configured spec, not only the default fixture in the E18 manifest.
        return loadReproductionRuntime(runtime);
    }
    catch {
        return null;
    }
}
function freezeRuntime(runtime, parent) {
    const root = path.join(parent, "runtime");
    const specRelative = path.relative(runtime.root, runtime.specPath);
    const executableRelative = path.relative(runtime.root, runtime.executable);
    for (const relative of new Set([...runtime.files, specRelative, executableRelative])) {
        const source = realpathSync(path.join(runtime.root, relative));
        if (!isInsideRoot(runtime.root, source) || !statSync(source).isFile()) {
            throw new Error("verifier input escaped its configured root");
        }
        const target = path.join(root, relative);
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(source, target);
    }
    // Rehash the copied files. A source edit during copying must not authorize a
    // mixed snapshot. Execution below reads only this private, verified copy.
    return loadReproductionRuntime({ root, specPath: path.join(root, specRelative),
        executable: path.join(root, executableRelative), timeoutMs: runtime.timeoutMs });
}
export function createReproductionDispatcher(runtime) {
    return (input) => {
        const bound = readBoundSpecDigest(input.terms.summary);
        if (!bound) {
            return defaultVerifier(input);
        }
        const boundRuntime = readBoundRuntimeDigest(input.terms.summary);
        const live = currentRuntime(runtime);
        const liveRuntime = live?.runtimeDigest ?? null;
        if (!boundRuntime) {
            return {
                outcome: "fail",
                verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                reasons: ["unbound runtime: terms lack e18.runtimeDigest; spec digest alone is not executable authority"],
            };
        }
        if (!liveRuntime || boundRuntime !== liveRuntime) {
            return {
                outcome: "fail",
                verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                reasons: [
                    `verifier inputs changed: bound ${REPRODUCTION_RUNTIME_MARKER}${boundRuntime} is not live ${liveRuntime ?? "unreadable"}`,
                ],
            };
        }
        if (!live || bound !== live.specDigest) {
            return {
                outcome: "fail",
                verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                reasons: [
                    `wrong task: terms ${REPRODUCTION_SPEC_MARKER}${bound} is not the current host-controlled spec ${live?.specDigest ?? "unreadable"}`,
                ],
            };
        }
        const received = asEvidenceBuffer(input.evidenceBytes);
        if (!received) {
            return {
                outcome: "fail",
                verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                reasons: [
                    "reproduction-bound terms require received evidence bytes; a known digest or fixture catalog is not a submission",
                ],
            };
        }
        if (!receivedEvidenceMatches(input.artifact, received)) {
            return {
                outcome: "fail",
                verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                reasons: [
                    `staged evidence digest ${digestSha256Hex(received)} length ${received.byteLength} does not match bound artifact digest/length`,
                ],
            };
        }
        const bounds = defaultVerifier(input);
        if (bounds.outcome !== "pass") {
            return {
                outcome: bounds.outcome,
                verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                reasons: [
                    "reproduction evidence failed metadata bounds before the host-controlled verifier ran",
                    ...bounds.reasons,
                ],
            };
        }
        const staged = stageReceivedEvidence(received);
        try {
            const frozen = freezeRuntime(live, staged.dir);
            if (frozen.specDigest !== bound || frozen.runtimeDigest !== boundRuntime) {
                return { outcome: "fail", verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                    reasons: ["verifier inputs changed while freezing the runtime; old terms cannot authorize mixed inputs"] };
            }
            return runHostVerify(frozen, staged.file);
        }
        catch {
            return { outcome: "needs_review", verifierVersion: REPRODUCTION_VERIFIER_VERSION,
                reasons: ["could not freeze the bound verifier runtime; incomplete execution is not a pass"] };
        }
        finally {
            rmSync(staged.dir, { recursive: true, force: true });
        }
    };
}
export function createConfiguredVerifier(config) {
    if (config.verifierMode === "reproduction" && config.reproduction != null) {
        return createReproductionDispatcher(loadReproductionRuntime(config.reproduction));
    }
    return (input) => {
        if (readBoundSpecDigest(input.terms.summary)) {
            return {
                outcome: "fail",
                verifierVersion: DEFAULT_VERIFIER_VERSION,
                reasons: [
                    "terms bind e18.specDigest but EARNED_WORK_VERIFIER is not reproduction; metadata-only cannot impersonate reproduction",
                ],
            };
        }
        return defaultVerifier(input);
    };
}
export { defaultVerifier, DEFAULT_VERIFIER_VERSION };
//# sourceMappingURL=reproduction-verifier.js.map
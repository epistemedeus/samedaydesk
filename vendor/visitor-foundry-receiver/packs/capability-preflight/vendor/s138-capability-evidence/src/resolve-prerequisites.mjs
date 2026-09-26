/**
 * R2-CAPABILITIES-02: Installation prerequisite resolver.
 * Caller inputs are data (manifest objects / paths), not instructions.
 * Catalog appearance alone is never treated as executable readiness.
 * Empty / unknown manifests do not default to ready.
 */

const READY_STATES = new Set(["satisfied", "missing", "unknown", "blocked"]);

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

/** Probe observations must be boolean true/false; truthy strings/objects never manufacture readiness. */
function boolProbe(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

/**
 * @param {object} input
 * @param {object} input.manifest - parsed package.json / grexal.json / kit package metadata
 * @param {string} [input.manifestKind] - package.json | grexal.json | agent-task-kit | unknown
 * @param {boolean} [input.catalogListed] - whether the item appears in a catalog (not readiness)
 * @param {object} [input.probe] - optional observed filesystem/runtime facts (data)
 */
export function resolvePrerequisites(input = {}) {
  const manifest = asObject(input.manifest, "manifest");
  const kind = String(input.manifestKind || inferKind(manifest));
  const catalogListed = input.catalogListed === true;
  const probeRaw = input.probe && typeof input.probe === "object" && !Array.isArray(input.probe) ? input.probe : {};
  const probe = probeRaw;

  const steps = [];
  const gaps = [];
  const prerequisites = [];

  const push = (id, state, note, evidenceClass = "manifest") => {
    if (!READY_STATES.has(state)) throw new Error(`invalid prerequisite state ${state}`);
    prerequisites.push({ id, state, evidenceClass, note });
  };

  if (catalogListed) {
    steps.push({
      id: "ignore-catalog-appearance",
      action: "Do not treat catalog appearance as install readiness",
      from: "catalogListed=true",
    });
  }

  if (kind === "unknown") {
    gaps.push({ field: "manifestKind", reason: "unknown manifest shape; no install signals observed" });
    push("manifest-kind", "unknown", "manifest kind unknown", "manifest-gap");
  }

  if (kind === "package.json" || (kind !== "unknown" && kind !== "grexal.json" && (manifest.name || manifest.engines || manifest.bin))) {
    const engines = manifest.engines?.node;
    if (engines != null && engines !== "") {
      const nodeOk = boolProbe(probe.nodeVersionSatisfies);
      if (probe.nodeVersionSatisfies != null && nodeOk === null) {
        gaps.push({
          field: "probe.nodeVersionSatisfies",
          reason: "non-boolean probe ignored; does not manufacture readiness",
        });
      }
      push(
        "node-engine",
        nodeOk === null ? "unknown" : nodeOk ? "satisfied" : "missing",
        `engines.node=${engines}`,
        nodeOk === null ? (probe.nodeVersionSatisfies == null ? "manifest" : "runtime-probe-invalid") : "runtime-probe",
      );
      steps.push({
        id: "check-node-engine",
        action: `Verify Node satisfies engines.node (${engines})`,
        from: "package.json#engines.node",
      });
    } else if (manifest.engines && typeof manifest.engines === "object" && !("node" in manifest.engines)) {
      gaps.push({ field: "engines.node", reason: "engines present but node not declared (optional engine)" });
      push("node-engine", "unknown", "engines.node optional/absent", "manifest-gap");
    } else if (kind === "package.json") {
      gaps.push({ field: "engines.node", reason: "not declared in manifest" });
      push("node-engine", "unknown", "engines.node not declared", "manifest-gap");
    }

    const binField = manifest.bin;
    if (typeof binField === "string" && binField.trim()) {
      const present = Array.isArray(probe.binExists) ? probe.binExists.includes(String(manifest.name || "bin")) : null;
      // string-bin: package.json bin as a single path string
      push(
        "bin:string",
        present == null ? "unknown" : present ? "satisfied" : "missing",
        `bin(string)=${binField}`,
        present == null ? "manifest" : "filesystem-probe",
      );
      steps.push({
        id: "install-string-bin",
        action: `Ensure string bin path exists: ${binField}`,
        from: "package.json#bin(string)",
      });
    } else if (binField && typeof binField === "object" && !Array.isArray(binField)) {
      const bins = Object.entries(binField);
      if (bins.length) {
        for (const [name, rel] of bins) {
          const present = Array.isArray(probe.binExists) ? probe.binExists.includes(name) : null;
          push(
            `bin:${name}`,
            present == null ? "unknown" : present ? "satisfied" : "missing",
            `bin ${name} -> ${rel}`,
            present == null ? "manifest" : "filesystem-probe",
          );
          steps.push({
            id: `install-bin-${name}`,
            action: `Ensure package file ${rel} is present for CLI ${name}`,
            from: "package.json#bin",
          });
        }
      } else {
        gaps.push({ field: "bin", reason: "empty bin object; no-bin library shape" });
        push("bin", "unknown", "no-bin library (empty bin object)", "manifest-gap");
      }
    } else if (kind === "package.json") {
      gaps.push({ field: "bin", reason: "no bin entry; no-bin library or CLI not declared" });
      push("bin", "unknown", "no bin entry", "manifest-gap");
    }

    if (manifest.type === "module") {
      steps.push({
        id: "esm-module",
        action: "Package declares type:module (ESM)",
        from: "package.json#type",
      });
      push("module-type", "satisfied", "type=module", "manifest");
    } else if (manifest.type === "commonjs" || manifest.type === "cjs") {
      steps.push({
        id: "cjs-module",
        action: "Package declares CommonJS type",
        from: "package.json#type",
      });
      push("module-type", "satisfied", `type=${manifest.type}`, "manifest");
    } else if (manifest.type != null) {
      gaps.push({ field: "type", reason: `unrecognized module type ${manifest.type}` });
      push("module-type", "unknown", `type=${manifest.type}`, "manifest-gap");
    }

    if (Array.isArray(manifest.files)) {
      steps.push({
        id: "pack-files",
        action: `Distribute only allowlisted files: ${manifest.files.join(", ")}`,
        from: "package.json#files",
      });
    }
  }

  if (kind === "grexal.json" || manifest.manifest_version != null || manifest.entrypoint) {
    const entry = manifest.entrypoint;
    const lang = manifest.runtime?.language;
    if (!entry) {
      gaps.push({ field: "entrypoint", reason: "missing" });
      push("grexal-entrypoint", "missing", "entrypoint required", "manifest-gap");
    } else {
      const exists = boolProbe(probe.entrypointExists);
      if (probe.entrypointExists != null && exists === null) {
        gaps.push({
          field: "probe.entrypointExists",
          reason: "non-boolean probe ignored; does not manufacture readiness",
        });
      }
      // Relative entrypoint is normal; missing-file only when probe boolean false.
      push(
        "grexal-entrypoint",
        exists === null ? "unknown" : exists ? "satisfied" : "missing",
        `entrypoint=${entry}`,
        exists === null
          ? probe.entrypointExists == null
            ? "manifest"
            : "filesystem-probe-invalid"
          : "filesystem-probe",
      );
      steps.push({
        id: "grexal-entrypoint",
        action: `Confirm entrypoint file exists: ${entry}`,
        from: "grexal.json#entrypoint",
      });
      if (exists === false) {
        gaps.push({ field: "entrypoint", reason: "probe reports entrypoint file missing" });
      }

      if (lang === "typescript") {
        const okExt = /\.(ts|js)$/.test(String(entry));
        if (!okExt) {
          push("grexal-entrypoint-ext", "blocked", "typescript runtime requires .ts or .js", "manifest");
          gaps.push({ field: "entrypoint", reason: "extension incompatible with runtime.language=typescript" });
        } else {
          push("grexal-entrypoint-ext", "satisfied", "entrypoint extension matches typescript (.ts|.js)", "manifest");
        }
        steps.push({
          id: "grexal-validate",
          action: "Run official grexal validate against this directory (not invented)",
          from: "grexal.json runtime contract",
        });
      } else if (lang == null || lang === "") {
        gaps.push({ field: "runtime.language", reason: "not declared" });
        push("grexal-language", "unknown", "runtime.language missing", "manifest-gap");
      } else if (lang === "python") {
        const okExt = /\.py$/.test(String(entry));
        if (!okExt) {
          push("grexal-entrypoint-ext", "blocked", "python runtime requires .py", "manifest");
          gaps.push({ field: "entrypoint", reason: "extension incompatible with runtime.language=python" });
        } else {
          push("grexal-entrypoint-ext", "satisfied", "entrypoint extension matches python (.py)", "manifest");
        }
        push("grexal-language", "satisfied", "runtime.language=python", "manifest");
      } else {
        gaps.push({ field: "runtime.language", reason: `unknown runtime.language=${lang}` });
        push("grexal-language", "unknown", `runtime.language=${lang} not in known set`, "manifest-gap");
      }
    }
  }

  if (kind === "agent-task-kit" || manifest.name === "agent-task-kit") {
    steps.push({
      id: "atk-extract",
      action: "Extract verified tarball; do not npm publish; use node bin/agent-task-kit.mjs",
      from: "agent-task-kit package contract",
    });
    // accepted-contract metadata only — never counted toward readiness (see observedSatisfied).
    push(
      "atk-execute-false",
      "satisfied",
      "kit contract notes execute:false / non-executing composition (not an observed install signal)",
      "accepted-contract",
    );
  }

  const blocking = prerequisites.filter((p) => p.state === "missing" || p.state === "blocked");
  const unknown = prerequisites.filter((p) => p.state === "unknown");
  const satisfied = prerequisites.filter((p) => p.state === "satisfied");
  // Ready only from caller-supplied boolean runtime/filesystem probes — never from
  // manifest metadata or accepted-contract rows alone.
  const OBSERVED_EVIDENCE = new Set(["runtime-probe", "filesystem-probe"]);
  const observedSatisfied = satisfied.filter((p) => OBSERVED_EVIDENCE.has(p.evidenceClass));

  let readiness = "not_ready";
  if (blocking.length) {
    readiness = "not_ready";
  } else if (observedSatisfied.length > 0 && unknown.length === 0 && gaps.length === 0) {
    readiness = "ready";
  } else if (unknown.length || gaps.length) {
    readiness =
      kind === "unknown" && observedSatisfied.length === 0 ? "not_ready" : "partial";
    if (observedSatisfied.length === 0 && !gaps.some((g) => g.field === "observations")) {
      gaps.push({
        field: "observations",
        reason: "no boolean runtime/filesystem observations satisfied",
      });
    }
  } else {
    // satisfied may exist (manifest/contract) but none are observed probes
    readiness = "not_ready";
    if (!gaps.some((g) => g.field === "observations")) {
      gaps.push({
        field: "observations",
        reason: "no boolean runtime/filesystem observations satisfied",
      });
    }
  }

  const actionableInstall =
    Boolean(manifest.engines?.node) ||
    Boolean(typeof manifest.bin === "string" && manifest.bin.trim()) ||
    Boolean(manifest.bin && typeof manifest.bin === "object" && Object.keys(manifest.bin).length) ||
    Boolean(manifest.entrypoint) ||
    satisfied.length > 0;
  if (catalogListed && !actionableInstall) {
    readiness = "not_ready";
    if (!gaps.some((g) => g.field === "manifest")) {
      gaps.push({ field: "manifest", reason: "catalogListed without actionable install fields" });
    }
  }

  return {
    schema: "s138.prereq-report.v1",
    capabilityId: "R2-CAPABILITIES-02",
    manifestKind: kind,
    catalogListed,
    readiness,
    steps,
    prerequisites,
    gaps,
    notes: [
      "Catalog appearance is never executable readiness.",
      "Empty prerequisites/gaps never imply ready.",
      "Non-boolean probes are ignored and do not manufacture observed readiness.",
      "ready requires ≥1 satisfied runtime-probe or filesystem-probe; manifest/accepted-contract alone never suffice.",
      "Caller observation remains caller-supplied data, not remote attestation.",
      "No invented SDK support: only fields present in the supplied manifest/probe are used.",
    ],
  };
}

function inferKind(manifest) {
  if (manifest.manifest_version != null || manifest.entrypoint) return "grexal.json";
  if (manifest.name === "agent-task-kit") return "agent-task-kit";
  if (manifest.name || manifest.engines || manifest.bin || manifest.type) return "package.json";
  return "unknown";
}

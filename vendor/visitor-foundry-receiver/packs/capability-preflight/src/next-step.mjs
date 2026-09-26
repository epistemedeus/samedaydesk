/**
 * Produce a runnable next-step manifest for a subsequent cold agent turn.
 * Relative paths only; no machine absolutes; no silent paid/network actions.
 * Journey commands use the caller/generated input path, not the bundled demo fixture.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HEAVY_PIN, HONESTY_NOTES, NEXT_STEP_SCHEMA } from "./constants.mjs";
import { scrubPortable } from "./portable.mjs";

const KIT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function composeStatusOf(report) {
  return (
    report.stages?.compose?.status ||
    report.compose?.status ||
    report.stages?.partialResult?.status ||
    report.partial?.status ||
    null
  );
}

function composeHolesOf(report) {
  return (
    report.stages?.compose?.holes ||
    report.compose?.holes ||
    report.stages?.partialResult?.holes ||
    report.partial?.holes ||
    null
  );
}

/**
 * @param {object} journeyOrFirstRun - kit report
 * @param {object} [opts]
 */
export function buildNextStepManifest(journeyOrFirstRun, opts = {}) {
  const report = journeyOrFirstRun && typeof journeyOrFirstRun === "object" ? journeyOrFirstRun : {};
  const artifacts = [];
  if (opts.artifactRelPath) {
    artifacts.push({
      kind: "report",
      path: opts.artifactRelPath,
      note: "Prior kit report (relative to unpack root)",
    });
  }
  if (report.coldStartArtifactPath) {
    artifacts.push({
      kind: "cold_start_artifact",
      path: report.coldStartArtifactPath,
    });
  }

  const nextRunInputRelPath = opts.nextRunInputRelPath || report.nextRunInputRelPath || null;

  const gaps = [];
  const readiness = report.stages?.prerequisites?.readiness || report.prereq?.readiness;
  const bindStatus = report.stages?.evidence?.status || report.binding?.status;
  const composeStatus = composeStatusOf(report);

  if (readiness && readiness !== "ready") {
    gaps.push({
      field: "prerequisites.readiness",
      value: readiness,
      next: "supply boolean probe via --probe or probe JSON",
    });
  }
  if (bindStatus && bindStatus !== "content_bound") {
    gaps.push({
      field: "evidence.status",
      value: bindStatus,
      next: "supply matching source+TAP content or accept untested_declaration",
    });
  }
  if (composeStatus && composeStatus !== "complete") {
    gaps.push({
      field: "compose.status",
      value: composeStatus,
      holes: composeHolesOf(report),
      next: "supply parts with status:complete and job schema/scope",
    });
  }

  const journeyInput = nextRunInputRelPath || "portable-out/next-run-input.json";
  const commands = [
    {
      id: "inspect",
      argv: ["node", "bin/capability-consumer-kit.mjs", "status"],
      auto: true,
      note: "Local status only",
    },
    {
      id: "cold-start",
      argv: [
        "node",
        "bin/capability-consumer-kit.mjs",
        "cold-start",
        "--probe",
        "--out-dir",
        "portable-out/demo-cold-start",
      ],
      auto: false,
      note: "Explicit demo only. Isolated --out-dir portable-out/demo-cold-start; never auto-overwrites caller next-run input.",
    },
    {
      id: "journey",
      argv: ["node", "bin/capability-consumer-kit.mjs", "journey", "--input", journeyInput],
      auto: false,
      note: nextRunInputRelPath
        ? `Continue the caller/generated job from ${journeyInput}`
        : "Full Cap01–08 journey from generated next-run input (not the bundled demo fixture)",
    },
    {
      id: "test",
      argv: ["node", "--test", "--test-concurrency=1", "tests/*.test.mjs"],
      auto: true,
      note: "Owning Node22 consumer suite (repository packing tests are pack-repository.test.mjs)",
    },
  ];

  const manifest = {
    schema: NEXT_STEP_SCHEMA,
    heavyPin: HEAVY_PIN,
    generatedFrom: report.schema || null,
    readyForRelease: false,
    paidCalls: false,
    liveNetwork: false,
    autoRunnable: commands.filter((c) => c.auto).map((c) => c.id),
    commands,
    artifacts,
    gaps,
    honestyNotes: [...HONESTY_NOTES],
    nextRunInput: journeyInput,
  };

  return scrubPortable(manifest, { kitRoot: KIT_ROOT });
}

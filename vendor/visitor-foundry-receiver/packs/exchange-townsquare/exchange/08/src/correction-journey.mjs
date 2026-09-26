/**
 * Useful request→correction path: brief + failed artifact → minimal amend → optional recheck.
 * Disjoint from admission-gate work: assumes files already admissible.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ex01 = await import(pathToFileURL(join(__dirname, "../../01/src/index.mjs")).href);
const ex05 = await import(pathToFileURL(join(__dirname, "../../05/src/index.mjs")).href);

export function runRequestToCorrectionJourney(input, { clock = () => Date.now() } = {}) {
  const brief = ex01.buildAcceptanceBrief(input.requirements, { clock });
  const first = ex05.buildCorrectionRequest(
    { brief, artifact: input.artifact, artifactRef: input.artifactRef || "artifact" },
    { clock },
  );

  let afterAmend = null;
  if (input != null && Object.prototype.hasOwnProperty.call(input, "correctedArtifact") && input.correctedArtifact !== undefined) {
    afterAmend = ex05.recheckAfterAmend(brief, input.correctedArtifact, { clock });
  }

  return {
    schema: "neomorphic.r2.exchange.request_correction_journey.v1",
    taskId: brief.taskId,
    briefStatus: brief.status,
    request: {
      status: first.status,
      restartTask: first.restartTask,
      amendCount: first.amendItems.length,
      retainedCount: first.acceptedParts.length,
      amendItems: first.minimalRequest.items,
      doNot: first.minimalRequest.doNot,
    },
    afterAmend: afterAmend
      ? {
          status: afterAmend.request.status,
          failed: afterAmend.request.objectiveSummary.failed,
          restartTask: afterAmend.request.restartTask,
        }
      : null,
    ok: afterAmend ? afterAmend.request.status === "none_needed" : first.status === "none_needed",
    consumerInstructions: [
      "1. Start from task requirements + failing artifact (request side).",
      "2. Apply only amendItems; keep retained accepted parts.",
      "3. Re-supply correctedArtifact; status should become none_needed.",
      "4. Never restartTask; never auto-pass subjective criteria.",
    ].join("\n"),
  };
}

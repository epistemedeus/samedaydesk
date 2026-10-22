/** Required installed journey, as distinct from the real-kernel foundation replay. */
export const JOURNEY_STAGES = [
    "signup_recovery", "task_listing_terms", "last_slot_race", "claim_readback", "draft_restart",
    "submission_readback", "clarification", "exact_review_acceptance", "synthetic_settlement",
    "consented_showcase", "discussion", "optional_share", "observed_referred_signup",
];
/** Missing stages stay pending; fixture-only successes cannot satisfy whole-journey evidence. */
export async function replayJourneyStages(replays) {
    if (new Set(replays.map(replay => replay.stage)).size !== replays.length ||
        replays.some(replay => !JOURNEY_STAGES.includes(replay.stage)))
        throw new Error("invalid or duplicate journey replay");
    const stages = [];
    for (const stage of JOURNEY_STAGES) {
        const replay = replays.find(candidate => candidate.stage === stage);
        if (!replay) {
            stages.push({ stage, state: "integration_pending", evidence: null });
            continue;
        }
        try {
            await replay.run();
            stages.push({ stage, state: "passed", evidence: replay.evidence });
        }
        catch {
            stages.push({ stage, state: "failed", evidence: replay.evidence });
        }
    }
    // Staging currently uses fixture authority bindings. Completion requires real
    // leaf services for every account-dependent step, with source-pinned exports.
    const kernelStages = ["synthetic_settlement"];
    const wholeJourneyPassed = stages.every(stage => stage.state === "passed" &&
        (stage.evidence === "installed_leaf" || (kernelStages.includes(stage.stage) && stage.evidence === "existing_kernel_postgres")));
    return {
        schema: "neomorphic.contributor-journey.harness.v1", wholeJourneyPassed,
        releaseAccepted: false, publicEnabled: false, usesSyntheticSettlement: true, stages,
    };
}
//# sourceMappingURL=harness.js.map
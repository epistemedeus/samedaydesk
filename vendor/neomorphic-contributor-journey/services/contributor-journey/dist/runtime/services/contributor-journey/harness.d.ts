/** Required installed journey, as distinct from the real-kernel foundation replay. */
export declare const JOURNEY_STAGES: readonly ["signup_recovery", "task_listing_terms", "last_slot_race", "claim_readback", "draft_restart", "submission_readback", "clarification", "exact_review_acceptance", "synthetic_settlement", "consented_showcase", "discussion", "optional_share", "observed_referred_signup"];
export type JourneyStage = typeof JOURNEY_STAGES[number];
export type StageReplay = {
    stage: JourneyStage;
    evidence: "existing_kernel_postgres" | "installed_leaf" | "fixture_only";
    run: () => Promise<void>;
};
export type HarnessReceipt = {
    schema: "neomorphic.contributor-journey.harness.v1";
    wholeJourneyPassed: boolean;
    releaseAccepted: false;
    publicEnabled: false;
    usesSyntheticSettlement: true;
    stages: Array<{
        stage: JourneyStage;
        state: "passed" | "failed" | "integration_pending";
        evidence: StageReplay["evidence"] | null;
    }>;
};
/** Missing stages stay pending; fixture-only successes cannot satisfy whole-journey evidence. */
export declare function replayJourneyStages(replays: StageReplay[]): Promise<HarnessReceipt>;

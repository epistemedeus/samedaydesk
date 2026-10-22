import type { PostgresStore } from "../../earned-work/src/store/postgres.js";
import type { CorrespondenceStore } from "../../correspondence/src/store/types.js";
import type { Submission } from "../../earned-work/src/types.js";
import type { ClarificationPort, KernelReviewPort, SourceBinding, SubmittedArtifact } from "./types.js";
/** No kernel table writes: all decisions pass through the existing store. */
export declare function createEarnedWorkReviewPort(options: {
    store: Pick<PostgresStore, "getTask" | "createVerdict" | "accept" | "reject" | "withOpportunityClient">;
    /** Read the committed artifact from the submission module's private records. */
    artifact(submission: Submission): Promise<SubmittedArtifact>;
}): KernelReviewPort;
export declare const reviewProjectSummary: (source: SourceBinding) => string;
/** Dedicated private correspondence project per exact source. No public writer grants. */
export declare function createCorrespondenceReviewPort(options: {
    store: Pick<CorrespondenceStore, "getProject" | "listEvents" | "createEvent">;
    projectId(source: SourceBinding): Promise<string>;
    /** Stable backend-only secret, persisted across restarts; never an account token. */
    integrityKey: string;
}): ClarificationPort;

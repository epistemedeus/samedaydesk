import type { CorrespondenceStore } from "../../correspondence/src/store/types.js";
import type { DiscussionJournal } from "./types.js";
export interface ProjectLock {
    run<T>(projectId: string, action: () => Promise<T>): Promise<T>;
}
export declare const MAX_THREAD_EVENTS = 5000;
/** This is an adapter to the existing event store, not a second message database.
 * Project creation and task->project binding are the integration owner's responsibility. */
export declare function createCorrespondenceJournal(store: CorrespondenceStore, lock: ProjectLock): DiscussionJournal;
/** Fixture only: coordinates one process. Production needs PostgresProjectLock. */
export declare class FixtureProjectLock implements ProjectLock {
    private tails;
    run<T>(projectId: string, action: () => Promise<T>): Promise<T>;
}

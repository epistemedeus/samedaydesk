import { createJourneyApp } from "./app.js";
import { createInstalledComposition } from './installed.js';
import type { ExistingServices, JourneyConfig, JourneyModule, JourneyPorts } from "./types.js";
export type JourneyRuntime = {
    installed?: Awaited<ReturnType<typeof createInstalledComposition>>;
    app: ReturnType<typeof createJourneyApp>;
    services: ExistingServices | null;
    config: JourneyConfig;
    close: () => Promise<void>;
};
export declare function createJourneyRuntime(options?: {
    config?: JourneyConfig;
    env?: NodeJS.ProcessEnv;
    ports?: JourneyPorts;
    modules?: JourneyModule[];
}): Promise<JourneyRuntime>;
/** Controller-only preparation. Creates references, never accounts, rounds, grants to recipients or payments. */
export declare function prepareJourneyDeployment(options?: {
    env?: NodeJS.ProcessEnv;
    config?: JourneyConfig;
    enroll?: boolean;
}): Promise<{
    schema: string;
    profile: "staging" | "live";
    migrated: boolean;
    enrolled: boolean;
    configuredRounds: number;
    configuredTasks: number;
    createsAccounts: boolean;
    createsRounds: boolean;
    createsPayments: boolean;
    releaseAccepted: boolean;
    publicEnabled: boolean;
    settlement: string;
}>;

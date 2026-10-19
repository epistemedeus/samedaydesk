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
    /** Server-owned reader, selected and independently received by the canonical owner. */
    canonicalReceiving?: import('./canonical-qualification.js').CanonicalReceiving;
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
/** Root's configured CLI: open an already prepared private installation without
 * migrations, enrollment, HTTP listener, signup, or public writing authority. */
export declare function openRootExternalControl(env: NodeJS.ProcessEnv): Promise<{
    installed: import("./installed.js").InstalledComposition;
    services: ExistingServices;
    close: () => Promise<void>;
}>;

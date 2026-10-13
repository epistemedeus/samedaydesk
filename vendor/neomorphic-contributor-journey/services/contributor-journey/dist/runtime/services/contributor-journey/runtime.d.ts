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

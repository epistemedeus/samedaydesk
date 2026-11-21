import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import type { Event, Policy, Query, State } from '../../experiments/contributor-network-measurement-227900/src/index.mjs';
import type { InstalledComposition } from './installed.js';
/** Private read-only receiving from committed sources. The caller may retain
 * returned state in the existing bounded measurement FileStore. Revisions never
 * change the product's authority. Missing populations/results remain unknown. */
export declare function readInstalledMeasurement(input: {
    kernel: PostgresStore;
    installed: InstalledComposition;
    rounds: readonly {
        roundKey: string;
        provenance: string;
    }[];
    window: {
        from: string;
        to: string;
        asOf: string;
    };
    state?: State;
}): Promise<{
    privateOnly: boolean;
    policy: Policy;
    events: Event[];
    state: State;
    query: Query;
    receipt: import("../../experiments/contributor-network-measurement-227900/src/index.mjs").Receipt;
    aggregate: import("../../experiments/contributor-network-measurement-227900/src/index.mjs").Result;
    relationship: {
        reports: any[];
        repeatLineage: any[];
        usefulnessEvidence: string;
        effortEvidence: string;
    };
    limitations: string[];
}>;

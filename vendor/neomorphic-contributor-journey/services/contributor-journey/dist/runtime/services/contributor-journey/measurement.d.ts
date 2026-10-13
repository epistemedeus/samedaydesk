import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import type { Policy, Query } from '../../experiments/contributor-network-measurement-227900/src/index.mjs';
import type { InstalledComposition } from './installed.js';
/** Private read-only source receiving. No aggregate counter is expanded into a fact.
 * Coverage stays partial: this reader does not capture every failed attempt or a
 * qualified canonical settlement. Historical/unbound rounds are never enrolled. */
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
}): Promise<{
    privateOnly: boolean;
    policy: Policy;
    events: any[];
    query: Query;
    receipt: import("../../experiments/contributor-network-measurement-227900/src/index.mjs").Receipt;
    aggregate: import("../../experiments/contributor-network-measurement-227900/src/index.mjs").Result;
    limitations: string[];
}>;

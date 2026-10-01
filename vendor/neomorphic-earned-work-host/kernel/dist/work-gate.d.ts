import type { OwnerTaskView, PublicTaskView, TaskAggregate } from "./types.js";
export type WorkabilityView = {
    schema: "arena.a3.workability-dimensions.envelope.v1";
    packet: {
        eligibility: {
            agentAccess: string;
            claimAuthority: string;
            doNotStartWork: boolean;
        };
        funding: {
            class: string;
            deadlineExpired: boolean;
            purpose: string;
        };
        effort: {
            kind: string;
            winProbability: "unknown";
        };
        mixedScore: {
            value: number;
            displayOnly: true;
        };
    };
    doNotStartWork: boolean;
    startWork: false;
    ignoredMixedScore: true;
    claimAuthority: string;
    reasons: string[];
    note: string;
};
export declare function workabilityForAggregate(agg: TaskAggregate, now?: Date): WorkabilityView;
export declare function withWorkability<T extends PublicTaskView | OwnerTaskView>(view: T, agg: TaskAggregate, now?: Date): T & {
    workability: WorkabilityView;
};

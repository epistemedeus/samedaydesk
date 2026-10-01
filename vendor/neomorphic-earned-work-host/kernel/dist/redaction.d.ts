import type { OwnerTaskView, PublicTaskView, TaskAggregate } from "./types.js";
export declare function isClaimable(agg: TaskAggregate, now: Date): boolean;
export declare function publicTask(agg: TaskAggregate, now: Date): PublicTaskView;
export declare function ownerTask(agg: TaskAggregate): OwnerTaskView;
export declare function ownerTaskWithoutSecrets(view: OwnerTaskView): OwnerTaskView;

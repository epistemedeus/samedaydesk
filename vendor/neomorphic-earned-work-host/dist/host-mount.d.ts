/**
 * Optional mount for a host that already listens (SameDayDesk Node).
 * Unconfigured or EARNED_WORK_MOUNT=0: disabled health only. No schema drop.
 * Imports the public @neomorphic/earned-work package. It does not import kernel source.
 */
import { type Express } from "express";
export declare const MOUNT_PREFIX = "/api/earned-work";
export declare const MOUNTED_PG_SCHEMA = "pilot_earned_work";
export type MountInspection = {
    kind: "unconfigured";
} | {
    kind: "invalid_config";
    detail: string;
} | {
    kind: "configured";
    url: string;
    token: string;
    schema: typeof MOUNTED_PG_SCHEMA;
    poolMax: number;
};
type MountReason = "unconfigured" | "invalid_config" | "store_unavailable" | "disabled" | "ready";
export type EarnedWorkMount = {
    readonly state: {
        status: "starting" | "disabled" | "ready";
        reason: MountReason;
    };
    ready: () => Promise<void>;
    close: () => Promise<void>;
};
/**
 * Generic DATABASE_URL does not enable the mount. The host may already use it.
 * Shared mode accepts only schema pilot_earned_work so public host tables stay put.
 */
export declare function inspectEarnedWorkMountEnv(env?: NodeJS.ProcessEnv): MountInspection;
export type MountOptions = {
    env?: NodeJS.ProcessEnv;
    prefix?: string;
    now?: () => number;
};
export declare function mountEarnedWork(parent: Express, options?: MountOptions): EarnedWorkMount;
export {};

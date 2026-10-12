import { type ServiceConfig } from "./config.js";
import type { EarnedWorkStore } from "./store/types.js";
import { type VerifierHook } from "./verifier.js";
export type AppOptions = {
    verifier?: VerifierHook;
};
export declare function createApp(store: EarnedWorkStore, config: ServiceConfig, options?: AppOptions): import("express-serve-static-core").Express;

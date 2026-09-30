import type { Express, Router } from "express";
import type { CorrespondenceStore } from "../store/types.js";
type Extension = {
    router: Router;
    checkReady(): Promise<void>;
    close(): Promise<void>;
};
/** Opt-in composition hook. Call before createApp to include extension readiness
 * in its existing health check, then mount after the app's transport middleware.
 * No migrations, worker dispatch or listeners are started by this hook. */
export declare function prepareFoundryHost(base: CorrespondenceStore, options?: {
    enabled?: boolean;
    create?: () => Promise<Extension>;
}): Promise<{
    mount(app: Express): void;
}>;
export {};

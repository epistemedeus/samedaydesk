import type { Express, Router } from "express";
import type { CorrespondenceStore } from "../store/types.js";
type Extension = {
    router: Router;
    checkReady(): Promise<void>;
    close(): Promise<void>;
};
export declare function prepareFoundryHost(base: CorrespondenceStore, options?: {
    enabled?: boolean;
    create?: () => Promise<Extension>;
}): Promise<{
    mount(app: Express): void;
}>;

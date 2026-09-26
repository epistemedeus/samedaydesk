import type { WorkCellStore } from "./store.js";
/** Mount on the existing correspondence app AFTER createApp, behind its existing
 * body limit/CORS/rate limiter. No listener, authentication system or admin API. */
export declare function createWorkCellRouter(store: WorkCellStore): import("express-serve-static-core").Router;

import { type ServiceConfig } from "../config.js";
import type { PostgresStore } from "../store/postgres.js";
export declare function mountOpportunityRoutes(app: {
    post: Function;
    get: Function;
}, store: PostgresStore, config: ServiceConfig): void;

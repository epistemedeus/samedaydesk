import { type Request } from "express";
import type { DiscussionService } from "./service.js";
export type DiscussionHttpOptions<Credential> = {
    /** Resolve cookie/header credential only; no roles, account IDs or grants from body/query. */
    credential(req: Request): Credential | null | Promise<Credential | null>;
    /** Existing session service CSRF + allowed-origin check. Required even for local staging. */
    authorizeWrite(req: Request): boolean | Promise<boolean>;
};
export declare function createDiscussionRouter<Credential>(service: DiscussionService<Credential>, options: DiscussionHttpOptions<Credential>): import("express-serve-static-core").Router;

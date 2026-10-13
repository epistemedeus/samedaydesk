import express, { type Request } from "express";
import type { AuthenticatedAccount, ExistingServices, JourneyConfig, JourneyModule, JourneyPorts, JourneyStatus, PortResult } from "./types.js";
export declare class JourneyBoundaryError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string);
}
export declare function unwrapPort<T>(result: PortResult<T>): T;
/** Validate even trusted adapter results. Session resolver227100 must check revocation on every request. */
export declare function resolveAuthenticatedAccount(req: Request, ports: JourneyPorts, now?: number): Promise<AuthenticatedAccount>;
export declare function createJourneyApp(options: {
    config: JourneyConfig;
    services?: ExistingServices;
    ports?: JourneyPorts;
    modules?: JourneyModule[];
    clock?: () => number;
    middleware?: express.RequestHandler;
    extra?: express.RequestHandler;
    settlement?: JourneyStatus['settlement'];
}): import("express-serve-static-core").Express;

import type { Express, Request, RequestHandler } from "express";
import type { createApp as createEarnedWorkApp } from '../earned-work/src/app.js';
import type { loadConfig as loadEarnedWorkConfig } from '../earned-work/src/config.js';
import type { createApp as createCorrespondenceApp } from '../correspondence/src/app.js';
import type { loadConfig as loadCorrespondenceConfig } from '../correspondence/src/config.js';
export declare const MODULE_IDS: readonly ["account", "claims", "submission", "review", "showcase", "discussion", "referral"];
export type ModuleId = typeof MODULE_IDS[number];
export type PortResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    code: "unauthenticated" | "forbidden" | "not_found" | "integration_pending" | "unavailable";
};
/** Server-resolved account authority. Alias, email and client role flags are not inputs. */
export type AuthenticatedAccount = {
    accountId: string;
    sessionId: string;
    authTime: string;
    expiresAt: string;
    publicProfileId?: string;
};
export type AccountResolver = (request: Request) => Promise<PortResult<AuthenticatedAccount>>;
/** Private binding owned by account227100. Never serialized, logged or bundled. */
export type EarnedWorkBinding = {
    accountId: string;
    principalId: string;
    token: string;
};
export type EarnedWorkBindingResolver = (account: AuthenticatedAccount) => Promise<PortResult<EarnedWorkBinding>>;
export type RequesterAuthorizer = (account: AuthenticatedAccount, taskId: string) => Promise<PortResult<{
    accountId: string;
    taskId: string;
    requesterId: string;
}>>;
/** Task-to-project/account-to-grant binding, supplied by discussion227600. */
export type CorrespondenceBindingResolver = (account: AuthenticatedAccount, taskId: string, access: "read" | "write") => Promise<PortResult<{
    accountId: string;
    taskId: string;
    projectId: string;
    token: string;
}>>;
export type JourneyPorts = {
    resolveAccount?: AccountResolver;
    resolveEarnedWorkBinding?: EarnedWorkBindingResolver;
    authorizeRequester?: RequesterAuthorizer;
    resolveCorrespondenceBinding?: CorrespondenceBindingResolver;
};
export type EarnedWorkStore = Parameters<typeof createEarnedWorkApp>[0];
export type EarnedWorkConfig = ReturnType<typeof loadEarnedWorkConfig>;
export type CorrespondenceStore = Parameters<typeof createCorrespondenceApp>[0];
export type CorrespondenceConfig = ReturnType<typeof loadCorrespondenceConfig>;
export type ExistingServices = {
    earnedWork: {
        store: EarnedWorkStore;
        config: EarnedWorkConfig;
        app: Express;
        /** Snapshot of this private principal's canonical rows, never an alias lookup. */
        readContributorWork: (taskId: string, principalId: string) => Promise<PrivateWorkReadback | null>;
    };
    correspondence: {
        store: CorrespondenceStore;
        config: CorrespondenceConfig;
        app: Express;
    };
};
export type PrivateWorkReadback = {
    taskId: string;
    reservation: {
        id: string;
        termsVersion: string;
        status: string;
        expiresAt: string;
    };
    submission: null | {
        artifactId: string;
        reservationId: string;
        termsVersion: string;
        artifact: {
            ref: string;
            digestSha256: string;
            mediaType: string;
            bytes: number;
        };
        submittedAt: string;
    };
    obligation: null | {
        obligationId: string;
        workId: string;
        payoutState: "owed";
    };
};
export type JourneyModuleContext = {
    services: ExistingServices;
    requireAccount: (request: Request) => Promise<AuthenticatedAccount>;
};
/** Adapter around an actual leaf export; no speculative leaf factory signature. */
export type JourneyModule = {
    id: ModuleId;
    sourceCommit: string;
    evidence: "installed" | "fixture_only";
    createRouter: (context: JourneyModuleContext) => RequestHandler;
    checkReady: () => Promise<void>;
};
export type JourneyConfig = {
    installed?: null | {
        origin: string;
        replayKey: string;
        integrityKey: string;
        cursorKey: string;
        futureRounds: Array<{
            roundKey: string;
            provenance: 'test' | 'fixture';
        }>;
    };
    mode: "disabled" | "staging";
    port: number;
    listenHost: "127.0.0.1" | "::1";
    mountPath: "/api/neomorphic-contributor-journey";
    corsOrigins: string[];
    bodyLimitBytes: number;
    rateLimitMax: number;
    rateLimitWindowMs: number;
    trustProxyHops: number;
    storage: null | {
        databaseUrl: string;
        earnedWorkSchema: "cj227_earned_work";
        correspondenceSchema: "cj227_correspondence";
        poolMax: 1 | 2;
        ownerToken: string;
        correspondenceAdminToken: string;
    };
};
export type JourneyStatus = {
    schema: "neomorphic.contributor-journey.status.v1";
    mode: JourneyConfig["mode"];
    ready: boolean;
    wholeJourney: "integration_pending";
    releaseAccepted: false;
    publicEnabled: false;
    settlement: "synthetic_only";
    modules: Array<{
        id: ModuleId;
        state: "integration_pending" | "fixture_only" | "installed";
        sourceCommit: string | null;
    }>;
};

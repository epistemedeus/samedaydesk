import express from "express";
import { z } from "zod";
import { readBearer } from "../../earned-work/src/auth.js";
import { tokensEqual } from "../../earned-work/src/crypto.js";
import { ApiError } from "../../earned-work/src/errors.js";
import { parse } from "./validation.js";
const COOKIE = "__Host-neo_contributor";
function cookieToken(req) {
    const matches = (req.header("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${COOKIE}=`));
    if (matches.length === 0)
        return undefined;
    if (matches.length !== 1)
        throw new ApiError(401, "unauthorized", "Account session is invalid.");
    try {
        return decodeURIComponent(matches[0].slice(COOKIE.length + 1));
    }
    catch {
        throw new ApiError(401, "unauthorized", "Account session is invalid.");
    }
}
export function readAccountSessionToken(req, allowCookie = false) {
    const bearer = readBearer(req), cookie = allowCookie ? cookieToken(req) : undefined;
    if (req.header("authorization") && !bearer)
        throw new ApiError(401, "unauthorized", "Account session is invalid.");
    if (bearer && cookie && !tokensEqual(bearer, cookie))
        throw new ApiError(401, "unauthorized", "Account session is ambiguous.");
    return bearer ?? cookie;
}
/** Leaves private contributor authority out of Request and every browser DTO. */
export function requireAuthenticatedAccount(service, options = {}) {
    return async (req, res, next) => {
        try {
            if (options.browserOrigin && cookieToken(req) &&
                ((req.header("origin") && req.header("origin") !== options.browserOrigin) ||
                    (req.method !== "GET" && req.header("origin") !== options.browserOrigin))) {
                res.status(403).json({ error: { code: "forbidden", message: "Account request origin is not allowed." } });
                return;
            }
            const result = await service.authenticate(readAccountSessionToken(req, Boolean(options.browserOrigin)));
            if (!result.ok) {
                res.status(result.error.status).json({ error: result.error });
                return;
            }
            req.account = result.value;
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
export function createAccountRouter(service, options = {}) {
    if (options.browserOrigin) {
        const url = new URL(options.browserOrigin);
        if (url.protocol !== "https:" || url.origin !== options.browserOrigin)
            throw new Error("Account browserOrigin must be a canonical HTTPS origin");
    }
    const router = express.Router();
    const proof = (req) => ({ idempotencyKey: req.header("idempotency-key"), proof: req.header("x-account-operation-proof") });
    const context = options.requestContext ?? ((req) => ({ clientAddress: req.socket.remoteAddress ?? "unknown" }));
    const sessionToken = (req) => readAccountSessionToken(req, Boolean(options.browserOrigin));
    const setSession = (res, receipt) => {
        const maxAge = Math.max(0, Math.floor((Date.parse(receipt.account.expiresAt) - Date.now()) / 1000));
        res.append("Set-Cookie", `${COOKIE}=${receipt.sessionToken}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
    };
    router.use((req, res, next) => {
        res.setHeader("Cache-Control", "no-store, private");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("X-Content-Type-Options", "nosniff");
        try {
            const origin = req.header("origin"), cookie = options.browserOrigin ? cookieToken(req) : undefined;
            if ((origin && origin !== options.browserOrigin) ||
                (req.header("sec-fetch-site") === "cross-site" && !origin) ||
                (req.method !== "GET" && cookie && origin !== options.browserOrigin)) {
                res.status(403).json({ error: { code: "forbidden", message: "Account request origin is not allowed." } });
                return;
            }
            next();
        }
        catch (error) {
            next(error);
        }
    });
    router.use(express.json({ limit: "4kb", strict: true }));
    const sendReceipt = async (req, res, result) => {
        if (!result.ok) {
            res.status(result.error.status).json({ error: result.error });
            return;
        }
        if (options.afterReceipt) {
            try {
                await options.afterReceipt(req, result.value);
            }
            catch {
                res.setHeader('X-Referral-Observation', 'unavailable');
            }
        }
        if (options.browserOrigin && req.header("origin") === options.browserOrigin) {
            setSession(res, result.value);
            const { sessionToken: _privateToken, ...value } = result.value;
            res.status(200).json({ ...value, replayed: result.replayed, sessionDelivery: "cookie" });
        }
        else
            res.status(200).json({ ...result.value, replayed: result.replayed, sessionDelivery: "bearer" });
    };
    router.post("/signup", async (req, res) => sendReceipt(req, res, await service.signup(req.body, proof(req), context(req))));
    router.post("/login", async (req, res) => sendReceipt(req, res, await service.login(req.body, proof(req), context(req))));
    router.post("/recover", async (req, res) => sendReceipt(req, res, await service.recover(req.body, proof(req), context(req))));
    router.post("/readback", async (req, res) => sendReceipt(req, res, await service.readback(req.body, proof(req), context(req))));
    router.get("/session", requireAuthenticatedAccount(service, options), (req, res) => {
        res.status(200).json({ account: req.account });
    });
    for (const path of ["logout", "logout-all"]) {
        router.post(`/${path}`, async (req, res, next) => {
            try {
                parse(z.object({}).strict(), req.body);
                const result = await service.logout(sessionToken(req), path === "logout-all");
                if (!result.ok) {
                    res.status(result.error.status).json({ error: result.error });
                    return;
                }
                if (options.browserOrigin && req.header("origin") === options.browserOrigin)
                    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);
                res.status(200).json({ ...result.value, replayed: result.replayed });
            }
            catch (error) {
                next(error);
            }
        });
    }
    router.post("/bindings/adopt", async (req, res, next) => {
        try {
            const result = await service.adoptKernelPrincipal(sessionToken(req), req.body);
            if (!result.ok) {
                res.status(result.error.status).json({ error: result.error });
                return;
            }
            res.status(200).json({ ...result.value, replayed: result.replayed });
        }
        catch (error) {
            next(error);
        }
    });
    router.use(((error, _req, res, _next) => {
        if (error instanceof ApiError) {
            res.status(error.status).json({ error: { code: error.code, message: error.message } });
            return;
        }
        const kind = typeof error === "object" && error !== null && "type" in error ? error.type : undefined;
        res.status(kind === "entity.too.large" ? 413 : 400).json({ error: { code: "invalid_input", message: "Account request could not be read." } });
    }));
    return router;
}
//# sourceMappingURL=http.js.map
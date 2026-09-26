import { CODE, OWNER_ROUTES } from "../constants.mjs";
import { DeskError } from "../errors.mjs";
import { inspectContributorPayoutKey, inspectWalletless } from "../authority.mjs";
import { owedVersusPaid } from "../owed-versus-paid.mjs";
import { isIntegerTermsVersion } from "../terms-version.mjs";

const OWNER_PATH =
  /\/v1\/tasks\/?$|\/terms$|\/funding\/reserve$|\/contributor-tokens$|\/verdicts$|\/accept$|\/reject$|\/obligation$|\/payout$/;

const HTTP_TIMEOUT_MS = 15_000;
const HTTP_MAX_BODY = 1_048_576;

function joinUrl(origin, path) {
  return new URL(path, origin.endsWith("/") ? origin : `${origin}/`).href;
}

export function assertSafeHttpOrigin(origin) {
  if (!origin || typeof origin !== "string") {
    throw new DeskError({
      code: CODE.INVALID_INPUT,
      message: "http adapter requires a caller-supplied origin",
      status: 400,
    });
  }
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new DeskError({
      code: CODE.INVALID_INPUT,
      message: "http adapter origin is not a URL",
      status: 400,
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DeskError({
      code: CODE.ADAPTER_REFUSED,
      message: `http adapter refuses origin protocol ${url.protocol}`,
      status: 400,
      rejected: true,
    });
  }
  if (url.username || url.password) {
    throw new DeskError({
      code: CODE.ADAPTER_REFUSED,
      message: "http adapter refuses origins with embedded credentials",
      status: 400,
      rejected: true,
    });
  }
  return url.href.replace(/\/$/, "") || origin;
}

/**
 * Caller-supplied earned-work origin. Public GET + contributor claim only.
 * Never sends an owner bearer. Never calls owner routes.
 */
export function createHttpAdapter({
  origin,
  contributorToken = null,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  timeoutMs = HTTP_TIMEOUT_MS,
} = {}) {
  const base = assertSafeHttpOrigin(origin);
  const clock = typeof now === "function" ? now : () => now;

  async function request(method, path, { body, token } = {}) {
    if (OWNER_PATH.test(path) && method !== "GET") {
      throw new DeskError({
        code: CODE.OWNER_ROUTE_REFUSED,
        message: `Desk refuses owner route ${method} ${path}. Owner routes stay off this adapter.`,
        status: 403,
        rejected: true,
        details: { ownerRoutes: OWNER_ROUTES },
      });
    }
    if (
      /\/(payout|obligation|accept|reject|verdicts|contributor-tokens|funding\/reserve)(?:\/|$)/.test(path)
    ) {
      throw new DeskError({
        code: CODE.OWNER_ROUTE_REFUSED,
        message: `Desk refuses owner route ${method} ${path}.`,
        status: 403,
        rejected: true,
      });
    }

    const headers = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body) {
      headers["content-type"] = "application/json";
      headers["idempotency-key"] = body.idempotencyKey || `desk_${Date.now()}`;
    }

    let response;
    try {
      response = await fetchImpl(joinUrl(base, path), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof DeskError) throw error;
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      throw new DeskError({
        code: CODE.ADAPTER_REFUSED,
        message: timedOut ? "origin request timed out" : String(error?.message || error),
        status: timedOut ? 504 : 502,
      });
    }

    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new DeskError({
        code: CODE.ADAPTER_REFUSED,
        message: "Desk refuses to follow HTTP redirects. Owner routes must stay unreachable.",
        status: 403,
        rejected: true,
        details: { path, method, status: response.status },
      });
    }

    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > HTTP_MAX_BODY) {
      throw new DeskError({
        code: CODE.ADAPTER_REFUSED,
        message: "origin response exceeds 1 MiB",
        status: 413,
      });
    }
    const text = await response.text();
    if (typeof text === "string" && text.length > HTTP_MAX_BODY) {
      throw new DeskError({
        code: CODE.ADAPTER_REFUSED,
        message: "origin response exceeds 1 MiB",
        status: 413,
      });
    }
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!response.ok) {
      throw new DeskError({
        code: json?.error?.code || CODE.ADAPTER_REFUSED,
        message: json?.error?.message || `origin responded ${response.status}`,
        status: response.status,
        details: { path, method },
      });
    }
    return json;
  }

  return {
    kind: "http",
    provenance: "caller_origin",
    walletless: true,
    origin: base,

    async browse() {
      const json = await request("GET", "/v1/tasks");
      const list = Array.isArray(json) ? json : json.tasks ?? json.items ?? [];
      return {
        schema: "neomorphic.contributor_desk.browse.v1",
        walletless: true,
        provenance: "caller_origin",
        adapter: "http",
        origin: base,
        tasks: list,
        observedAt: clock(),
      };
    },

    async claim(input = {}) {
      const payout = inspectContributorPayoutKey({ contributor: input, flags: input });
      if (!payout.ok) throw payout.error;
      const walletless = inspectWalletless(input);
      if (!walletless.ok) {
        throw new DeskError({
          code: CODE.NOT_WALLETLESS,
          message: "This desk is walletless. Do not supply a wallet, signature, or chain account to claim.",
          status: 400,
          rejected: true,
          details: { hits: walletless.hits },
        });
      }
      if (isIntegerTermsVersion(input.termsVersion)) {
        throw new DeskError({
          code: CODE.INTEGER_TERMS_VERSION_REJECTED,
          message: "Integer termsVersion is not a start-work key.",
          status: 400,
          rejected: true,
        });
      }
      if (!contributorToken) {
        throw new DeskError({
          code: CODE.INVALID_INPUT,
          message:
            "HTTP claim needs a contributor session token the caller already holds. The desk will not mint one with an owner token.",
          status: 401,
          rejected: true,
        });
      }
      const json = await request("POST", `/v1/tasks/${encodeURIComponent(input.taskId)}/claims`, {
        token: contributorToken,
        body: {
          termsVersion: input.termsVersion,
          contributorPublicId: input.contributorPublicId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return {
        schema: "neomorphic.contributor_desk.claim.v1",
        walletless: true,
        adapter: "http",
        origin: base,
        result: json,
        observedAt: clock(),
      };
    },

    async status(input = {}) {
      const json = await request("GET", `/v1/tasks/${encodeURIComponent(input.taskId)}`);
      const task = json.task ?? json;
      return {
        schema: "neomorphic.contributor_desk.status.v1",
        walletless: true,
        adapter: "http",
        origin: base,
        task,
        lifecycle: task.lifecycle,
        fundingState: task.fundingState,
        payoutState: task.payoutState,
        paid: false,
        settled: false,
        transfer: null,
        observedAt: clock(),
      };
    },

    async appeal() {
      throw new DeskError({
        code: CODE.APPEAL_UNSUPPORTED_ON_ORIGIN,
        message:
          "F01 kernel has no appeal route. This desk will not map appeal onto owner accept or reject.",
        status: 409,
        rejected: true,
      });
    },

    async owedVersusPaid(input = {}) {
      const json = await request("GET", `/v1/tasks/${encodeURIComponent(input.taskId)}`);
      const task = json.task ?? json;
      const shaped = {
        id: task.id,
        payoutState: task.payoutState ?? (task.lifecycle === "accepted" ? "owed" : "none"),
        paid: false,
        settled: false,
        transfer: null,
        reservation: task.reservation ?? null,
        obligation: task.obligation ?? null,
        updatedAt: clock(),
      };
      return {
        ...owedVersusPaid(shaped, { now: clock() }),
        adapterNote:
          "Public status only. Desk does not call owner GET /payout. paid and settled stay false.",
      };
    },
  };
}

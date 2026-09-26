import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { TERMS_VERSION_RE } from "../src/constants.mjs";
import { hashToken } from "../src/hash.mjs";

/**
 * Fixture-class HTTP stub shaped like I01 contributor-tokens + claim.
 * Not proof of a real I01/Postgres path. Local-runtime tests boot PR54.
 */
function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8") || "{}";
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendEmpty(res, status) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end("");
}

function bearer(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim();
}

export function createFixtureEarnedWorkServer({
  ownerToken = "dev-owner-token-s275",
  plantedContributorToken = `ew_ctr_${randomBytes(24).toString("base64url")}`,
  emptyGrant201 = false,
  emptyClaim201 = false,
} = {}) {
  const ownerHash = hashToken(ownerToken);
  const contributors = new Map();
  const tasks = new Map();
  const claimsByKey = new Map();
  const grantRequests = [];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (req.method === "GET" && url.pathname === "/healthz") {
        send(res, 200, { ok: true, enabled: true, store: "fixture" });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/tasks") {
        const token = bearer(req);
        if (!token || hashToken(token) !== ownerHash) {
          send(res, 401, { error: { code: "unauthorized", message: "invalid grant" } });
          return;
        }
        const body = await readBody(req);
        const taskId = `tsk_${randomBytes(8).toString("hex")}`;
        const termsVersion = `sha256:${sha256Json({ taskId, terms: body.terms || {}, schema: "fixture" })}`;
        const task = {
          id: taskId,
          title: body.title,
          provenance: body.provenance || "fixture",
          lifecycle: "open",
          fundingState: "unfunded",
          termsVersion,
        };
        tasks.set(taskId, task);
        send(res, 201, { task });
        return;
      }
      const getTask = url.pathname.match(/^\/v1\/tasks\/([^/]+)$/);
      if (req.method === "GET" && getTask && !url.pathname.includes("/claims")) {
        const task = tasks.get(getTask[1]);
        if (!task) {
          send(res, 404, { error: { code: "not_found", message: "task not found" } });
          return;
        }
        send(res, 200, {
          task: {
            id: task.id,
            lifecycle: task.lifecycle,
            fundingState: task.fundingState,
            termsVersion: task.termsVersion,
            claimable: task.lifecycle === "open" && task.fundingState === "reserved",
          },
        });
        return;
      }
      const reserve = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/funding\/reserve$/);
      if (req.method === "POST" && reserve) {
        const token = bearer(req);
        if (!token || hashToken(token) !== ownerHash) {
          send(res, 401, { error: { code: "unauthorized", message: "invalid grant" } });
          return;
        }
        const task = tasks.get(reserve[1]);
        if (!task) {
          send(res, 404, { error: { code: "not_found", message: "task not found" } });
          return;
        }
        task.fundingState = "reserved";
        send(res, 200, { task });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/contributor-tokens") {
        grantRequests.push({
          idempotencyKey: req.headers["idempotency-key"] || null,
          hasIdempotencyHeader: Object.prototype.hasOwnProperty.call(req.headers, "idempotency-key"),
        });
        const token = bearer(req);
        if (!token || hashToken(token) !== ownerHash) {
          send(res, 401, { error: { code: "unauthorized", message: "invalid grant" } });
          return;
        }
        const body = await readBody(req);
        const issued = emptyGrant201
          ? `ew_ctr_${randomBytes(24).toString("base64url")}`
          : plantedContributorToken;
        contributors.set(hashToken(issued), {
          publicId: body.contributorPublicId,
          taskScope: body.taskId || null,
          token: issued,
        });
        if (emptyGrant201) {
          sendEmpty(res, 201);
          return;
        }
        send(res, 201, {
          token: issued,
          contributorPublicId: body.contributorPublicId,
          expiresAt: null,
          provenance: body.provenance,
        });
        return;
      }
      const claim = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/claims$/);
      if (req.method === "POST" && claim) {
        const token = bearer(req);
        const principal = token ? contributors.get(hashToken(token)) : null;
        if (!principal) {
          send(res, 401, { error: { code: "unauthorized", message: "invalid grant" } });
          return;
        }
        const idem = req.headers["idempotency-key"];
        if (idem && claimsByKey.has(idem)) {
          send(res, 200, claimsByKey.get(idem));
          return;
        }
        const body = await readBody(req);
        if (typeof body.termsVersion === "number") {
          send(res, 400, {
            error: {
              code: "invalid_input",
              message: "integer termsVersion is rejected; use the sha256 content hash",
            },
          });
          return;
        }
        if (typeof body.termsVersion !== "string" || !TERMS_VERSION_RE.test(body.termsVersion)) {
          send(res, 400, {
            error: { code: "invalid_input", message: "termsVersion must be sha256 hash" },
          });
          return;
        }
        const task = tasks.get(claim[1]);
        if (!task) {
          send(res, 404, { error: { code: "not_found", message: "task not found" } });
          return;
        }
        if (principal.taskScope && principal.taskScope !== task.id) {
          send(res, 403, { error: { code: "forbidden", message: "contributor token is scoped to a different task" } });
          return;
        }
        if (task.fundingState !== "reserved") {
          send(res, 409, { error: { code: "unfunded", message: "funding is not reserved" } });
          return;
        }
        const reservation = {
          id: `rsv_${randomBytes(8).toString("hex")}`,
          taskId: task.id,
          termsVersion: body.termsVersion,
          status: "active",
        };
        task.lifecycle = "claimed";
        const payload = { reservation, task };
        if (idem) claimsByKey.set(idem, payload);
        if (emptyClaim201) {
          sendEmpty(res, 201);
          return;
        }
        send(res, 201, payload);
        return;
      }
      send(res, 404, { error: { code: "not_found", message: "no fixture route" } });
    } catch (error) {
      send(res, 500, { error: { code: "http_error", message: error.message } });
    }
  });

  return {
    evidenceClass: "fixture",
    plantedContributorToken,
    ownerToken,
    grantRequests,
    listen() {
      return new Promise((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          resolve({
            baseUrl: `http://127.0.0.1:${address.port}`,
            port: address.port,
            plantedContributorToken,
            grantRequests,
            close: () => new Promise((res, rej) => server.close((err) => (err ? rej(err) : res()))),
          });
        });
        server.once("error", reject);
      });
    },
  };
}

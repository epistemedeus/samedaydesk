import http from "node:http";
import { ACK_SCHEMA } from "./pins.mjs";

export function postCallbackOnce({ url, payload, eventId, attemptId, timeoutMs = 8_000 }) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const target = new URL(url);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = http.request(
      {
        protocol: "http:",
        hostname: target.hostname,
        port: urlPort(target),
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": body.length,
          "x-outbox-event-id": eventId,
          "x-outbox-attempt-id": attemptId,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          finish({
            kind: "complete",
            status: res.statusCode,
            raw: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("aborted", () => finish({ kind: "unknown", error: "response-aborted" }));
        res.on("error", (err) => finish({ kind: "unknown", error: err.message }));
      },
    );

    req.on("error", (err) => {
      finish({ kind: "unknown", error: err.code || err.message });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finish({ kind: "unknown", error: "timeout-after-attempt" });
    });
    req.write(body);
    req.end();
  });
}

function urlPort(url) {
  if (url.port) return Number(url.port);
  return 80;
}

function hex64(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function parseAck(raw, expected) {
  const eventId = typeof expected === "string" ? expected : expected.eventId;
  const callbackPath = typeof expected === "object" ? expected.callbackPath : null;
  const outputsDigest = typeof expected === "object" ? expected.outputsDigest : null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "ack-not-json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "ack-not-object" };
  }
  if (parsed.ack !== true) {
    return { ok: false, reason: "ack-not-true", parsed };
  }
  if (parsed.eventId !== eventId) {
    return { ok: false, reason: "ack-event-mismatch", parsed };
  }
  if (!callbackPath || parsed.callbackPath !== callbackPath) {
    return { ok: false, reason: "ack-destination-mismatch", parsed };
  }
  if (!hex64(outputsDigest) || parsed.outputsDigest !== outputsDigest) {
    return { ok: false, reason: "ack-digest-mismatch", parsed };
  }
  return {
    ok: true,
    ack: {
      schema: parsed.schema || ACK_SCHEMA,
      ack: true,
      eventId,
      callbackPath,
      outputsDigest,
      buyerAccepted: false,
      sale: false,
      receivedAt: parsed.receivedAt || null,
    },
  };
}

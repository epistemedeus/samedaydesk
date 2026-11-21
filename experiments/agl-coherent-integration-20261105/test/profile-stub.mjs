// In-process profile stub for the installed 0.3.1 client. No socket is opened.
import https from "node:https";
import { EventEmitter } from "node:events";
import { appendFileSync, readFileSync } from "node:fs";

const descriptor = JSON.parse(readFileSync(process.env.H154540_DESCRIPTOR, "utf8"));
const required = descriptor.requiredProfile;
const log = process.env.H154540_HTTP_LOG;
const PREFIX = "/api/neomorphic-contributor-journey";

https.request = (url, options, callback) => {
  const req = new EventEmitter();
  req.setTimeout = () => req;
  req.destroy = () => {};
  req.end = (data) => {
    const parsed = new URL(url);
    const path = parsed.pathname.slice(PREFIX.length) + parsed.search;
    const body = data ? JSON.parse(Buffer.from(data).toString("utf8")) : undefined;
    appendFileSync(log, `${JSON.stringify({ method: options.method, path: path.split("?")[0], body: body ?? null })}\n`);
    let status = 404;
    let payload = { ok: false, code: "not_found" };
    if (options.method === "GET" && path.split("?")[0] === "/v1/market/profile") {
      status = 200;
      payload = {
        ok: true,
        value: {
          capability: {
            money: required.money,
            sourceSha256: required.sourceSha256,
            hostSha256: required.hostSha256,
          },
          participation: { protocol: required.participation },
        },
      };
    }
    const res = new EventEmitter();
    res.statusCode = status;
    res.headers = {};
    res.rawHeaders = [];
    res.complete = true;
    queueMicrotask(() => {
      callback(res);
      res.emit("data", Buffer.from(JSON.stringify(payload)));
      res.complete = true;
      res.emit("end");
    });
  };
  return req;
};

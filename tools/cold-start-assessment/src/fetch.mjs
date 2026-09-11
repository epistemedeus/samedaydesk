import { readFileSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";
import https from "node:https";
import { publicArchiveIsGitHub } from "./catalog.mjs";
import { AssessmentError } from "./errors.mjs";
import { assertNoPaymentHeaders } from "./settle-guard.mjs";

function normalizeMime(value) {
  if (!value) return "";
  return String(value).split(";")[0].trim().toLowerCase();
}

export function loadOrigin(fixtureDir) {
  const raw = readFileSync(join(fixtureDir, "origin.json"), "utf8");
  const origin = JSON.parse(raw);
  if (origin.schema !== "samedaydesk.cold-start-assessment.fixture-origin.v1") {
    throw new AssessmentError("invalid_fixture", "fixture origin.json schema mismatch", 2);
  }
  return origin;
}

function expectedFromRoute(rec) {
  if (!rec) return null;
  return {
    bytes: rec.expectedBytes ?? rec.bytes ?? null,
    sha256: rec.expectedSha256 ?? rec.sha256 ?? null,
  };
}

function httpGet(url, { maxBytes, timeoutMs, headers }) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { agent: false, headers }, (res) => {
      const chunks = [];
      let total = 0;
      res.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy();
          reject(
            new AssessmentError(
              "size_mismatch",
              `response larger than ${maxBytes} bytes; download stopped before extract`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const headerMap = {};
        for (const [key, value] of Object.entries(res.headers || {})) {
          headerMap[String(key).toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
        }
        resolve({
          url,
          status: res.statusCode || 0,
          headers: headerMap,
          mime: normalizeMime(headerMap["content-type"]),
          body: Buffer.concat(chunks),
        });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new AssessmentError("fetch_timeout", "fetch timeout"));
    });
    req.on("error", (err) => {
      reject(err instanceof AssessmentError ? err : new AssessmentError("fetch_failed", err.message));
    });
  });
}

export function createFetcher(options) {
  const mode = options.mode;
  if (mode === "fixture") {
    const origin = loadOrigin(options.fixtureDir);
    return {
      mode,
      origin,
      expectedFor(url) {
        return expectedFromRoute(origin.routes?.[url]);
      },
      async fetchUrl(url, init = {}) {
        assertNoPaymentHeaders(init.headers);
        if (publicArchiveIsGitHub(url)) {
          throw new AssessmentError(
            "github_not_required",
            "public acquisition uses the HTTPS archive path; GitHub credentials are not required and GitHub hosts are refused",
            1,
          );
        }
        const rec = origin.routes[url];
        if (!rec) {
          throw new AssessmentError("fixture_route_missing", `fixture origin has no route for ${url}`);
        }
        const headers = { ...(rec.headers || {}) };
        let body = Buffer.alloc(0);
        if (rec.file) {
          body = readFileSync(join(options.fixtureDir, rec.file));
        } else if (rec.body != null) {
          body = Buffer.from(typeof rec.body === "string" ? rec.body : JSON.stringify(rec.body));
        }
        return {
          url,
          status: rec.status ?? 200,
          headers,
          mime: normalizeMime(headers["content-type"]),
          body,
        };
      },
    };
  }

  if (mode === "file") {
    return {
      mode,
      origin: null,
      expectedFor() {
        return null;
      },
      async fetchUrl(url, init = {}) {
        assertNoPaymentHeaders(init.headers);
        const src = url.startsWith("file:") ? new URL(url).pathname : url;
        const body = readFileSync(src);
        return {
          url,
          status: 200,
          headers: { "content-type": "application/gzip" },
          mime: "application/gzip",
          body,
        };
      },
    };
  }

  return {
    mode: "live",
    origin: null,
    expectedFor() {
      return null;
    },
    async fetchUrl(url, init = {}) {
      assertNoPaymentHeaders(init.headers);
      if (publicArchiveIsGitHub(url)) {
        throw new AssessmentError(
          "github_not_required",
          "public acquisition uses the HTTPS archive path; GitHub credentials are not required and GitHub hosts are refused",
          1,
        );
      }
      const headers = { accept: init.accept || "*/*", ...(init.headers || {}) };
      assertNoPaymentHeaders(headers);
      return httpGet(url, {
        maxBytes: init.maxBytes ?? 8 * 1024 * 1024,
        timeoutMs: init.timeoutMs ?? 60_000,
        headers,
      });
    },
  };
}

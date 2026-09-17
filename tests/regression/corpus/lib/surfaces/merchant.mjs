import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpaFallback } from "../../../../../server/lib/spa-fallback.js";
import { NOT_FOUND_SHELL, ROUTE_SHELL_DIR, shellFileName } from "../../../../../server/lib/spa-route-shells.js";
import { MCP_TOOL_NAMES } from "../../../../../server/lib/mcp-tool-inventory.js";
import { loadMatrix, routeJob } from "../../../../../tools/offer-routing/route-job.mjs";
import { classifyResponse } from "../classify-http.mjs";
import { CORPUS_ROOT, REPO_ROOT } from "../root.mjs";
import { accept, reject } from "../result.mjs";

function mockExpressRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    type(value) {
      this.headers["content-type"] = value.includes("/") ? value : `text/${value}`;
      return this;
    },
    send(body) {
      this.body = String(body);
      this.ended = true;
      return this;
    },
    sendFile(filePath, cb) {
      try {
        this.body = readFileSync(filePath, "utf8");
        this.ended = true;
        if (!this.headers["content-type"]) this.headers["content-type"] = "text/html";
        cb?.();
      } catch (err) {
        cb?.(err);
      }
      return this;
    },
  };
  return res;
}

async function spaStatus(pathname) {
  const dist = mkdtempSync(join(tmpdir(), "sds-corpus-spa-"));
  try {
    writeFileSync(
      join(dist, "index.html"),
      "<!doctype html><html><head><title>SameDayDesk: agent commerce, built and shipped</title></head><body>spa</body></html>\n",
    );
    mkdirSync(join(dist, ROUTE_SHELL_DIR), { recursive: true });
    const notFound = `<!doctype html><html><head><title>${NOT_FOUND_SHELL.title}</title></head><body>requested page does not exist</body></html>`;
    writeFileSync(join(dist, ROUTE_SHELL_DIR, shellFileName(NOT_FOUND_SHELL.path)), notFound);
    const fallback = createSpaFallback(dist);
    const res = mockExpressRes();
    await new Promise((resolve, reject) => {
      fallback({ method: "GET", path: pathname }, res, (err) => (err ? reject(err) : resolve()));
      if (res.ended) resolve();
    });
    return res;
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}

export function judgeCdnFixture(fixture) {
  const kind = classifyResponse(fixture);
  if (kind === "cdn_challenge") {
    return reject("cdn_challenge", "hcdn/JS-challenge HTML is not a product 200.", {
      product: { kind, status: fixture.status },
    });
  }
  if (kind === "ok" || fixture.status === 200) {
    return accept("cdn_as_product_200", "hcdn challenge HTML was treated as a product 200.", {
      product: { kind, status: fixture.status },
    });
  }
  return reject(kind, "hcdn/JS-challenge HTML is not a product 200.", {
    product: { kind, status: fixture.status },
  });
}

export async function evaluateMerchant(id) {
  if (id === "merchant.offer-routing-complete-issue") {
    const job = JSON.parse(
      readFileSync(join(REPO_ROOT, "tools/offer-routing/fixtures/complete-issue-discussion.job.json"), "utf8"),
    );
    const out = routeJob(job, { matrix: loadMatrix() });
    const refused =
      out.ok === false &&
      out.selected === null &&
      out.paid === false &&
      out.executionAuthorized === false &&
      Array.isArray(out.warnings) &&
      out.warnings.includes("complete_issue_acquisition_unavailable");
    if (!refused) {
      return accept("complete_issue_routed", "complete_issue_discussion selected a paid extract route.", {
        product: out,
      });
    }
    return reject("complete_issue_acquisition_unavailable", "Issue comments are not a paid HTML extract.", {
      product: { selected: out.selected, paid: out.paid, warnings: out.warnings },
    });
  }

  if (id === "merchant.spa-unknown-path") {
    const res = await spaStatus("/this-path-does-not-exist-xyz");
    if (res.statusCode === 200) {
      return accept("spa_soft_404", "Unknown HTML path was served as HTTP 200.", {
        product: { status: res.statusCode, body: res.body },
      });
    }
    return reject("spa_unknown_404", "Unknown SPA paths stay HTTP 404, not a product 200.", {
      product: { status: res.statusCode },
    });
  }

  if (id === "merchant.mcp-missing-required-tool") {
    const requiredExtra = "does_not_exist_required_tool";
    const missing = MCP_TOOL_NAMES.includes(requiredExtra) ? [] : [requiredExtra];
    if (missing.length === 0) {
      return accept("invented_tool_listed", "A nonexistent MCP tool name was treated as shipped.", {
        product: { tools: [...MCP_TOOL_NAMES], toolsCalled: false },
      });
    }
    return reject("missing_required_tool", "Apex tools/list does not invent extra names and does not POST tools/call.", {
      product: { tools: [...MCP_TOOL_NAMES], missing, toolsCalled: false },
    });
  }

  if (id === "merchant.cdn-challenge") {
    const fixture = JSON.parse(readFileSync(join(CORPUS_ROOT, "fixtures/http/cdn-challenge.json"), "utf8"));
    return judgeCdnFixture(fixture);
  }

  if (id === "merchant.x402-unpaid-extract") {
    const fixture = JSON.parse(readFileSync(join(CORPUS_ROOT, "fixtures/http/x402-unpaid.json"), "utf8"));
    const kind = classifyResponse(fixture);
    if (kind === "ok") {
      return accept("unpaid_extract_ok", "HTTP 402 unpaid extract was treated as product success.", {
        product: { kind, status: fixture.status },
      });
    }
    return reject("payment_required", "Unpaid /extract stays HTTP 402; corpus does not pay.", {
      product: { kind, status: fixture.status },
    });
  }

  throw new Error(`unknown merchant evaluator ${id}`);
}

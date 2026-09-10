#!/usr/bin/env node
/**
 * S79 two-origin Chromium gate: observatory (origin B) + routing/acquisition (origin A).
 * Viewports 1280 and 390. Loopback only. No production hosts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { createMockedSdsOrigin } from "./fixture-server.mjs";
import { evaluate, launchChrome, navigate, screenshotPng, setViewport } from "./chrome.mjs";
import { findChrome, isLoopbackUrl, isProductionHost, parseArgs, requestHost, unusedPort } from "./lib.mjs";
import { createObservatoryRouter } from "../../server/routes/observatory.js";
import { createObservatoryRuntime, listSources } from "../../server/lib/observatory/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const VIEWPORTS = Object.freeze([
  Object.freeze({ name: "mobile-390", width: 390, height: 844, mobile: true }),
  Object.freeze({ name: "desktop-1280", width: 1280, height: 800, mobile: false }),
]);
const FETCHED_AT = "2026-09-10T02:00:00.000Z";
const BODIES = {
  moltjobs: { totalJobs: 12, totalCompleted: 4, totalAgents: 18, totalVolumeUsdc: "1.5", escrowedUsdc: "0.5" },
  x402stats: {
    snapshot: {
      sellers: 2,
      volumeUsd: "1.5",
      organicSellers: 1,
      organicVolumeUsd: "0.5",
      avgPaymentUsd: 0.5,
      medianSellerRevenueUsd: 0.5,
      top10VolumeShare: 0.8,
      windowDays: 30,
      computedAt: FETCHED_AT,
    },
  },
  smithery_mcp: {
    pagination: { totalCount: 12345 },
    servers: [{ id: "fixture-only", qualifiedName: "fixture/tool", description: "x".repeat(32) }],
  },
};

const PROBE = `(() => ({
  href: location.href,
  title: document.title,
  h1: document.querySelector("h1")?.textContent.trim() || null,
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  bodyText: (document.body.innerText || "").replace(/\\s+/g, " ").trim(),
}))()`;

function addFailure(failures, id, message) {
  failures.push({ id, message });
}

function mockedObservatoryRuntime() {
  return createObservatoryRuntime({
    now: () => Date.parse(FETCHED_AT),
    fetchImpl: async (url) => {
      const def = listSources().find((item) => item.upstreamUrl === String(url));
      if (!def) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(BODIES[def.sourceId]));
    },
  });
}

async function createObservatoryOrigin() {
  const port = await unusedPort();
  const runtime = mockedObservatoryRuntime();
  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (_req, res) => res.json({ ok: true, mount: "/api/observatory", fixture: true }));
  app.use("/api/observatory", createObservatoryRouter({ runtime }));
  app.get("/observatory", async (_req, res) => {
    const snapshot = await runtime.observeAll();
    res.set("content-type", "text/html; charset=utf-8");
    res.set("cache-control", "no-store");
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Observatory snapshot</title></head><body>
<h1>Observatory snapshot</h1>
<p>Named sources only. Not a URL proxy.</p>
<pre id="snapshot">${JSON.stringify(snapshot, null, 2)}</pre>
</body></html>`);
  });
  app.get("/routing/complete-issue", (_req, res) => {
    res.set("content-type", "text/html; charset=utf-8");
    res.set("cache-control", "no-store");
    res.end(routeJobHtml());
  });
  app.get("/acquisition/skill", (_req, res) => {
    res.set("content-type", "text/html; charset=utf-8");
    res.set("cache-control", "no-store");
    res.end(acquisitionHtml());
  });
  const server = app.listen(port, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function routeJobHtml() {
  const job = join(repoRoot, "tools/offer-routing/fixtures/complete-issue-discussion.job.json");
  const routed = spawnSync(process.execPath, [join(repoRoot, "tools/offer-routing/route-job.mjs"), job], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  const body = routed.stdout || routed.stderr || "{}";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offer routing</title></head><body>
<h1>Task to existing offer</h1>
<p>complete_issue_discussion is unsupported in the published router.</p>
<pre id="route">${body.replaceAll("<", "&lt;")}</pre>
</body></html>`;
}

function acquisitionHtml() {
  const skill = readFileSync(join(repoRoot, "overlays/s69-issue-job-acquisition/SKILL.md"), "utf8");
  const escaped = skill.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline issue-evidence acquisition</title></head><body>
<h1>Offline issue-evidence acquisition</h1>
<p>Local overlay CLI. Not a hosted job runner. Not a complete-discussion purchase.</p>
<pre id="skill">${escaped}</pre>
</body></html>`;
}

export async function runS79TwoOrigin({ outDir } = {}) {
  const dest = outDir || join(tmpdir(), `s79-two-origin-${process.pid}`);
  mkdirSync(dest, { recursive: true });
  mkdirSync(join(dest, "screenshots"), { recursive: true });
  const failures = [];
  const pages = [];
  const requests = [];
  const chromeBin = findChrome();
  if (!chromeBin) throw new Error("system Chrome not found; do not use /usr/local/bin/google-chrome wrapper");

  const observatory = await createObservatoryOrigin();
  const sds = await createMockedSdsOrigin();
  let chrome;
  try {
    const specs = [
      {
        id: "observatory-page",
        origin: "observatory",
        url: `${observatory.base}/observatory`,
        titleIncludes: "Observatory snapshot",
        h1Includes: "Observatory snapshot",
        bodyIncludes: ["Named sources only", "moltjobs", "x402stats", "smithery_mcp"],
      },
      {
        id: "routing-complete-issue",
        origin: "observatory",
        url: `${observatory.base}/routing/complete-issue`,
        titleIncludes: "Offer routing",
        h1Includes: "Task to existing offer",
        bodyIncludes: ["complete_issue_acquisition_unavailable", "unsupported in the published router"],
      },
      {
        id: "offline-acquisition",
        origin: "observatory",
        url: `${observatory.base}/acquisition/skill`,
        titleIncludes: "Offline issue-evidence acquisition",
        h1Includes: "Offline issue-evidence acquisition",
        bodyIncludes: ["issue-evidence", "Not a hosted job runner"],
      },
      {
        id: "for-agents",
        origin: "sds",
        url: `${sds.base}/for-agents`,
        titleIncludes: "Practical agent jobs",
        h1Includes: "opt-in reuse",
        bodyIncludes: ["POST /extract/batch", "source-change-alert"],
      },
      {
        id: "fixture-example-a",
        origin: "sds",
        url: `${sds.base}/fixture/pages/example-a.html`,
        titleIncludes: "Alpha Watch Page",
        h1Includes: "Alpha",
        bodyIncludes: ["comparable record extraction"],
      },
    ];

    for (const viewport of VIEWPORTS) {
      // Launch Chrome at this size. Do not resize a 1280 session down to 390.
      if (chrome) {
        await chrome.close();
        chrome = null;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      chrome = await launchChrome({
        viewport,
        logPath: join(dest, `chrome-${viewport.name}.log`),
      });
      await chrome.cdp.send("Network.enable");
      chrome.cdp.on("Network.requestWillBeSent", (params) => {
        const url = params.request?.url;
        if (url) requests.push({ url, type: params.type || null });
      });
      await chrome.cdp.send("Runtime.enable");
      // Chrome 148 headless: do not set mobile:true device metrics (reports ~650 CSS px).
      await setViewport(chrome.cdp, { width: viewport.width, height: viewport.height });
      for (const spec of specs) {
        await navigate(chrome.cdp, spec.url);
        const probe = await evaluate(chrome.cdp, PROBE);
        const png = await screenshotPng(chrome.cdp);
        const shot = `${spec.id}-${viewport.name}.png`;
        writeFileSync(join(dest, "screenshots", shot), png);
        if (probe.innerWidth !== viewport.width) {
          addFailure(failures, spec.id, `${viewport.name} innerWidth ${probe.innerWidth} != ${viewport.width}`);
        }
        if (spec.titleIncludes && !(probe.title || "").includes(spec.titleIncludes)) {
          addFailure(failures, spec.id, `${viewport.name} title ${JSON.stringify(probe.title)} missing ${spec.titleIncludes}`);
        }
        if (spec.h1Includes && !(probe.h1 || "").includes(spec.h1Includes)) {
          addFailure(failures, spec.id, `${viewport.name} h1 ${JSON.stringify(probe.h1)} missing ${spec.h1Includes}`);
        }
        for (const snippet of spec.bodyIncludes || []) {
          if (!(probe.bodyText || "").includes(snippet)) {
            addFailure(failures, spec.id, `${viewport.name} body missing ${JSON.stringify(snippet)}`);
          }
        }
        pages.push({
          id: spec.id,
          viewport: viewport.name,
          url: spec.url,
          origin: spec.origin,
          title: probe.title,
          h1: probe.h1,
          innerWidth: probe.innerWidth,
          screenshot: shot,
        });
      }
    }

    const productionHits = requests.filter((item) => isProductionHost(requestHost(item.url)));
    if (productionHits.length) {
      addFailure(failures, "network", `production hosts requested: ${productionHits.map((item) => item.url).join(", ")}`);
    }
    const nonLoopback = requests.filter(
      (item) =>
        !isLoopbackUrl(item.url) &&
        !item.url.startsWith("data:") &&
        !item.url.startsWith("blob:") &&
        !item.url.startsWith("about:"),
    );
    if (nonLoopback.length) {
      addFailure(failures, "network", `non-loopback: ${nonLoopback.map((item) => item.url).join(", ")}`);
    }

    const report = {
      ok: failures.length === 0,
      chrome: chromeBin,
      chromeVersion: chrome.version?.Browser || null,
      viewports: VIEWPORTS,
      origins: { sds: sds.base, observatory: observatory.base },
      pages,
      requestCount: requests.length,
      productionHits,
      nonLoopback,
      failures,
    };
    writeFileSync(join(dest, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    return { ...report, outDir: dest };
  } finally {
    if (chrome) await chrome.close();
    await sds.close();
    await observatory.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out || join(tmpdir(), `s79-two-origin-${process.pid}`);
  const report = await runS79TwoOrigin({ outDir });
  process.stdout.write(`${JSON.stringify({ ok: report.ok, outDir: report.outDir, failures: report.failures, origins: report.origins }, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}

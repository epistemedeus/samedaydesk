#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createMockedSdsOrigin } from "./fixture-server.mjs";
import { evaluate, launchChrome, navigate, screenshotPng, setViewport } from "./chrome.mjs";
import {
  DESKTOP_VIEWPORT,
  isLoopbackUrl,
  isProductionHost,
  parseArgs,
  parseViewport,
  requestHost,
} from "./lib.mjs";

const PAGE_SPECS = Object.freeze([
  {
    id: "for-agents",
    path: "/for-agents",
    screenshot: "for-agents-desktop.png",
    expect: {
      titleIncludes: "Practical agent jobs",
      h1Includes: "opt-in reuse",
      bodyIncludes: [
        "POST /extract/batch",
        "0.01 USDC",
        "source-change-alert",
        "issue-to-work-brief",
        "buyer-setup-trace",
        "charged: true",
        "immutable",
      ],
    },
    layout: "desktop-nav",
  },
  {
    id: "record-repeat",
    path: "/for-agents/record-repeat",
    screenshot: "record-repeat-desktop.png",
        expect: {
      titleIncludes: "Compare OpenAPI, prices, keyed CSV, and feeds offline",
      h1Includes: "Compare OpenAPI ops, price rows, keyed CSV, and feeds",
            bodyIncludes: [
        "/kit/record-repeat-job-",
        "sha256",
        "labeled samples",
        "Unsupported HTML",
        "/discovery/record-repeat.json",
        "Download archive",
      ],
    },
    layout: "desktop-nav",
  },
  {
    id: "distribution-repair",
    path: "/for-agents/distribution-repair",
    screenshot: "distribution-repair-desktop.png",
        expect: {
      titleIncludes: "Diagnose why a listed tool cannot run",
      h1Includes: "Diagnose why a listed tool cannot run from",
            bodyIncludes: [
        "/kit/distribution-repair-",
        "sha256",
        "provider",
        "jobRef",
        "sharedEvidenceId",
        "Incomplete captures",
        "Download archive",
      ],
    },
    layout: "desktop-nav",
  },
  {
    id: "x402",
    path: "/x402",
    screenshot: "x402-desktop.png",
    expect: {
      titleIncludes: "x402",
      h1Includes: "Agents discover a service",
      bodyIncludes: ["/for-agents", "recurring page or record recipes", "POST /extract/batch"],
    },
    layout: "desktop-nav",
  },
  {
    id: "seller-conformance",
    path: "/x402/seller-conformance",
    screenshot: "seller-conformance-desktop.png",
    expect: {
      titleIncludes: "Seller conformance",
      h1Includes: "inspection, not a guarantee",
      bodyIncludes: ["Agent402", "not a product, certificate, or runtime monitor"],
    },
  },
  {
    id: "verified",
    path: "/x402/verified",
    screenshot: "verified-desktop.png",
    expect: {
      titleIncludes: "Inspected x402 routes",
      h1Includes: "Inspected routes",
      bodyIncludes: ["unpaid 402", "Machine-readable feed"],
    },
  },
  {
    id: "ai-readiness",
    path: "/tools/ai-readiness",
    screenshot: "ai-readiness-desktop.png",
    expect: {
      titleIncludes: "AI Readiness",
      h1Includes: "visible to AI search",
      bodyIncludes: ["llms.txt", "JSON-LD"],
    },
  },
  {
    id: "fixture-example-a",
    path: "/fixture/pages/example-a.html",
    screenshot: "fixture-example-a-desktop.png",
    expect: {
      titleIncludes: "Alpha Watch Page",
      h1Includes: "Alpha",
      bodyIncludes: ["comparable record extraction"],
    },
  },
  {
    id: "fixture-example-b-partial",
    path: "/fixture/pages/example-b-partial.html",
    screenshot: "fixture-example-b-partial-desktop.png",
    expect: {
      titleIncludes: "Beta Watch Page Changed",
      bodyIncludes: ["No h1 on purpose"],
      missingH1: true,
    },
  },
]);

const PROBE = `(() => {
  const h1 = document.querySelector("h1");
  const links = document.querySelector("nav.links");
  const label = document.querySelector(".x402Label");
  const signin = document.querySelector(".signin");
  const pre = document.querySelector("main pre, pre");
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left };
  };
  return {
    href: location.href,
    title: document.title,
    h1: h1 ? h1.textContent.trim() : null,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    linksDisplay: links ? getComputedStyle(links).display : null,
    x402LabelDisplay: label ? getComputedStyle(label).display : null,
    signinDisplay: signin ? getComputedStyle(signin).display : null,
    preOverflowX: pre ? getComputedStyle(pre).overflowX : null,
    h1Box: box(h1),
    bodyText: (document.body.innerText || "").replace(/\\s+/g, " ").trim(),
    canonical: document.querySelector('link[rel="canonical"]')?.href || null,
  };
})()`;

function addFailure(failures, id, message) {
  failures.push({ id, message });
}

function includesFolded(haystack, needle) {
  return String(haystack || "").includes(needle);
}

function checkPage(spec, probe, viewport, failures) {
  if (!includesFolded(probe.title, spec.expect.titleIncludes)) {
    addFailure(failures, spec.id, `title ${JSON.stringify(probe.title)} missing ${spec.expect.titleIncludes}`);
  }
  if (spec.expect.missingH1) {
    if (probe.h1) addFailure(failures, spec.id, `expected no h1, got ${JSON.stringify(probe.h1)}`);
  } else if (!includesFolded(probe.h1, spec.expect.h1Includes)) {
    addFailure(failures, spec.id, `h1 ${JSON.stringify(probe.h1)} missing ${spec.expect.h1Includes}`);
  }
  for (const snippet of spec.expect.bodyIncludes || []) {
    if (!includesFolded(probe.bodyText, snippet)) {
      addFailure(failures, spec.id, `body missing ${JSON.stringify(snippet)}`);
    }
  }
  if (spec.expect.missingH1 !== true && probe.h1Box && (probe.h1Box.width < 8 || probe.h1Box.height < 8)) {
    addFailure(failures, spec.id, `h1 box not visible: ${JSON.stringify(probe.h1Box)}`);
  }
  if (spec.layout === "desktop-nav") {
    if (probe.innerWidth !== viewport.width) {
      addFailure(failures, spec.id, `innerWidth ${probe.innerWidth} != ${viewport.width}`);
    }
    if (probe.linksDisplay !== "flex") {
      addFailure(failures, spec.id, `desktop nav.links display ${probe.linksDisplay}, expected flex`);
    }
    // Flex items blockify `display: inline` to `block`. Hidden is `none`.
    if (viewport.width >= 980 && probe.x402LabelDisplay === "none") {
      addFailure(failures, spec.id, `desktop .x402Label is hidden`);
    }
    if (probe.signinDisplay === "none") {
      addFailure(failures, spec.id, `desktop .signin is hidden`);
    }
    if (probe.preOverflowX && probe.preOverflowX !== "auto" && probe.preOverflowX !== "scroll") {
      addFailure(failures, spec.id, `pre overflow-x ${probe.preOverflowX}, expected auto`);
    }
  }
}

async function probeMediaQueryContrast(cdp, failures) {
  await setViewport(cdp, { width: 375, height: 812, mobile: true });
  const narrow = await evaluate(cdp, PROBE);
  if (narrow.linksDisplay !== "none") {
    addFailure(failures, "for-agents-narrow-contrast", `nav.links at 375px was ${narrow.linksDisplay}, expected none`);
  }
  if (narrow.x402LabelDisplay !== "none") {
    addFailure(failures, "for-agents-narrow-contrast", `.x402Label at 375px was ${narrow.x402LabelDisplay}, expected none`);
  }
  await setViewport(cdp, { width: 1440, height: 900, mobile: false });
  const restored = await evaluate(cdp, PROBE);
  if (restored.linksDisplay !== "flex") {
    addFailure(failures, "for-agents-restore-desktop", `nav.links after restore was ${restored.linksDisplay}`);
  }
  return {
    narrow: {
      innerWidth: narrow.innerWidth,
      linksDisplay: narrow.linksDisplay,
      x402LabelDisplay: narrow.x402LabelDisplay,
      signinDisplay: narrow.signinDisplay,
    },
    restored: {
      innerWidth: restored.innerWidth,
      linksDisplay: restored.linksDisplay,
      x402LabelDisplay: restored.x402LabelDisplay,
      signinDisplay: restored.signinDisplay,
    },
  };
}

export async function runDesktopSmoke({ outDir, viewport = DESKTOP_VIEWPORT, keepServer = false } = {}) {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "screenshots"), { recursive: true });
  const failures = [];
  const pages = [];
  const requests = [];
  const origin = await createMockedSdsOrigin();
  let chrome;
  try {
    chrome = await launchChrome({
      viewport,
      logPath: join(outDir, "chrome.log"),
    });
    await chrome.cdp.send("Network.enable");
    chrome.cdp.on("Network.requestWillBeSent", (params) => {
      const url = params.request?.url;
      if (url) requests.push({ url, type: params.type || null });
    });
    await chrome.cdp.send("Runtime.enable");
    await setViewport(chrome.cdp, viewport);

    for (const spec of PAGE_SPECS) {
      const url = `${origin.base}${spec.path}`;
      await navigate(chrome.cdp, url);
      const probe = await evaluate(chrome.cdp, PROBE);
      const png = await screenshotPng(chrome.cdp);
      const screenshotPath = join(outDir, "screenshots", spec.screenshot);
      writeFileSync(screenshotPath, png);
      checkPage(spec, probe, viewport, failures);
      let contrast = null;
      if (spec.id === "for-agents") contrast = await probeMediaQueryContrast(chrome.cdp, failures);
      pages.push({
        id: spec.id,
        url,
        screenshot: screenshotPath,
        title: probe.title,
        h1: probe.h1,
        innerWidth: probe.innerWidth,
        innerHeight: probe.innerHeight,
        linksDisplay: probe.linksDisplay,
        x402LabelDisplay: probe.x402LabelDisplay,
        signinDisplay: probe.signinDisplay,
        preOverflowX: probe.preOverflowX,
        canonical: probe.canonical,
        contrast,
      });
    }

    const productionHits = requests.filter((item) => isProductionHost(requestHost(item.url)));
    if (productionHits.length) {
      addFailure(failures, "network", `production hosts requested: ${productionHits.map((item) => item.url).join(", ")}`);
    }
    const nonLoopback = requests.filter((item) => !isLoopbackUrl(item.url) && !item.url.startsWith("data:") && !item.url.startsWith("blob:") && !item.url.startsWith("about:"));
    const report = {
      ok: failures.length === 0,
      lane: "desktop",
      viewport,
      chrome: chrome.chrome,
      chromeVersion: chrome.version?.Browser || null,
      fixture: origin.routes,
      pages,
      requestCount: requests.length,
      productionHits,
      nonLoopbackRequests: nonLoopback,
      failures,
      nearestCommands: {
        spaRouteShells: "node --test server/scripts/test-spa-route-shells.js",
        forAgentsOverflow: "node server/scripts/test-for-agents-code-overflow.js",
        recurringRecipes: "npm run test:recurring-job-recipes",
        thisSmoke: "node --test tools/browser-smoke/desktop.test.mjs",
        thisCli: "node tools/browser-smoke/desktop.mjs --out DIR",
        chromeDirect: `${chrome.chrome} --headless=new --no-sandbox --user-data-dir=/tmp/sds-chrome --window-size=1440,900 --dump-dom http://127.0.0.1:${origin.port}/for-agents`,
      },
    };
    writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(outDir, "network.json"), `${JSON.stringify({ requests, productionHits, nonLoopback }, null, 2)}\n`);
    return report;
  } finally {
    if (chrome) await chrome.close();
    if (!keepServer) await origin.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out || join(tmpdir(), `sds-browser-desktop-${process.pid}`);
  const viewport = parseViewport(args.viewport, DESKTOP_VIEWPORT);
  const report = await runDesktopSmoke({ outDir, viewport, keepServer: Boolean(args["keep-server"]) });
  process.stdout.write(`${JSON.stringify({ ok: report.ok, outDir, failures: report.failures, fixture: report.fixture }, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}

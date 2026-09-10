import { readFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONTRACTS, GATEWAY_ORIGIN, MERCHANT_INPUT_PIN } from "../../vendor/merchant-contracts.mjs";
import { createMerchantRequire, requireMerchantRoot } from "../../vendor/resolve-merchant-root.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..", "..");
const pagesDir = join(packageRoot, "fixtures", "pages");

function unusedPort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
    probe.once("error", reject);
  });
}

export async function createFixtureOrigin({ port: requestedPort, enablePageChange = true, enableSkills = true } = {}) {
  const merchantRoot = requireMerchantRoot();
  const express = createMerchantRequire(merchantRoot)("express");
  const port = requestedPort ?? (await unusedPort());
  const base = `http://127.0.0.1:${port}`;
  const app = express();
  // Do not attach express.json globally: page-change-http reads the raw body itself.

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, fixture: true, merchantInputPin: MERCHANT_INPUT_PIN.slice(0, 8) });
  });

  app.get("/fixture/pages/:name", (req, res) => {
    const file = join(pagesDir, req.params.name);
    try {
      const text = readFileSync(file, "utf8");
      res.type("html").send(text);
    } catch {
      res.status(404).json({ error: "fixture_not_found", name: req.params.name });
    }
  });

  if (enablePageChange) {
    const pageChange = await import(pathToFileURL(join(merchantRoot, "page-change-http.mjs")).href);
    pageChange.mountPageChangeHttp(app, {
      env: {
        PAGE_CHANGE_HTTP_ENABLED: "1",
        PAGE_CHANGE_SOURCE_COMMIT: MERCHANT_INPUT_PIN,
        PAGE_CHANGE_XAGENT_SLUG: "samedaydesk-page-change",
        PAGE_CHANGE_XAGENT_COMMIT: MERCHANT_INPUT_PIN,
      },
    });
  }

  if (enableSkills) {
    const skills = await import(pathToFileURL(join(merchantRoot, "well-known-skills.mjs")).href);
    skills.mountWellKnownSkills(app, {
      publicUrl: GATEWAY_ORIGIN,
      skillsRoot: join(merchantRoot, "plugins", "samedaydesk-x402", "skills"),
    });
  }

  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", resolve);
    server.once("error", reject);
  });

  return {
    base,
    port,
    routes: {
      pageChange: `${base}${CONTRACTS.C31.routes.compare}`,
      pageChangeHealth: `${base}${CONTRACTS.C31.routes.health}`,
      pageChangeOpenapi: `${base}${CONTRACTS.C31.routes.openapi}`,
      skillsIndex: `${base}${CONTRACTS.C34.routes.skillsIndex}`,
      pageChangeSkill: `${base}${CONTRACTS.C34.routes.pageChangeSkill}`,
      explicitRecordSkill: `${base}${CONTRACTS.C34.routes.explicitRecordSkill}`,
      fixturePage: `${base}/fixture/pages/example-a.html`,
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

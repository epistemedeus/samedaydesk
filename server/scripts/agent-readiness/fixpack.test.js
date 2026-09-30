import { describe, expect, it } from "./expect-shim.js";
import { unzipSync, strFromU8 } from "../../lib/agent-readiness/zip.js";
import { DEMO_BUNDLES, demoBundle } from "../../lib/agent-readiness/demo.js";
import { API_CATALOG_PATH, fixPackMarkdown, fixPackZip, generateFixPack } from "../../lib/agent-readiness/fixpack.js";
const EMPTY = {
  schema: "agent-readiness.probe.v1",
  host: "nothing.example",
  probedAt: "2026-09-24T09:00:00Z",
  responses: { "/llms.txt": { status: 404 } }
};
function allowedUrls(bundle) {
  const origin = `https://${bundle.host}`;
  const allowed = /* @__PURE__ */ new Set([`${origin}${API_CATALOG_PATH}`]);
  for (const [path, res] of Object.entries(bundle.responses))
    if (res.status >= 200 && res.status < 300) allowed.add(`${origin}${path}`);
  if (bundle.mcp?.url) allowed.add(bundle.mcp.url);
  return allowed;
}
const fileList = (host) => {
  const pack = generateFixPack(demoBundle(host));
  return { files: pack.files.map((f) => f.path), skipped: pack.skipped.map((s) => s.path) };
};
describe("fix pack file lists", () => {
  it("ein.llc", () => {
    expect(fileList("ein.llc")).toMatchInlineSnapshot(`
      {
        "files": [
          "agent-card.json",
          "api-catalog.linkset.json",
          "llms-additions.md",
          "cors/express.js",
          "cors/nginx.conf",
        ],
        "skipped": [
          "server.json",
          "mcp-version-negotiation.md",
        ],
      }
    `);
  });
  it("samedaydesk.com", () => {
    expect(fileList("samedaydesk.com")).toMatchInlineSnapshot(`
      {
        "files": [
          "agent-card.json",
          "api-catalog.linkset.json",
          "llms-additions.md",
          "cors/express.js",
          "cors/nginx.conf",
          "server.json",
          "mcp-version-negotiation.md",
        ],
        "skipped": [],
      }
    `);
  });
  it("agents.samedaydesk.com", () => {
    expect(fileList("agents.samedaydesk.com")).toMatchInlineSnapshot(`
      {
        "files": [
          "agent-card.json",
          "api-catalog.linkset.json",
          "llms-additions.md",
          "cors/express.js",
          "cors/nginx.conf",
          "server.json",
        ],
        "skipped": [
          "mcp-version-negotiation.md",
        ],
      }
    `);
  });
  it("neomorphic.io", () => {
    expect(fileList("neomorphic.io")).toMatchInlineSnapshot(`
      {
        "files": [
          "agent-card.json",
          "api-catalog.linkset.json",
          "llms-additions.md",
          "cors/express.js",
          "cors/nginx.conf",
        ],
        "skipped": [
          "server.json",
          "mcp-version-negotiation.md",
        ],
      }
    `);
  });
  it("a site with no surfaces generates nothing and says why", () => {
    const pack = generateFixPack(EMPTY);
    expect(pack.files).toEqual([]);
    expect(pack.skipped.length).toBeGreaterThanOrEqual(6);
    expect(fixPackMarkdown(pack)).toContain("not generated: no MCP URL in the bundle");
  });
});
describe("fix pack invariants", () => {
  for (const bundle of [...DEMO_BUNDLES, EMPTY]) {
    it(`${bundle.host}: every URL comes from the bundle or is the api-catalog path`, () => {
      const pack = generateFixPack(bundle);
      const allowed = allowedUrls(bundle);
      const text = fixPackMarkdown(pack);
      const urls = text.match(/https?:\/\/[^\s"'<>)`\]]+/g) ?? [];
      for (const u of urls) expect(allowed, `invented URL ${u}`).toContain(u);
    });
    it(`${bundle.host}: every file carries the review header`, () => {
      const pack = generateFixPack(bundle);
      const header = `generated from probe bundle ${bundle.host} ${bundle.probedAt}; review before publishing`;
      for (const f of pack.files) expect(f.content, f.path).toContain(header);
    });
  }
  it("the MCP version note appears only for old-only servers", () => {
    expect(fileList("samedaydesk.com").files).toContain("mcp-version-negotiation.md");
    expect(fileList("agents.samedaydesk.com").files).not.toContain("mcp-version-negotiation.md");
  });
  it("the CORS snippet never allows credentials", () => {
    const pack = generateFixPack(demoBundle("ein.llc"));
    const cors = pack.files.filter((f) => f.path.startsWith("cors/"));
    expect(cors).toHaveLength(2);
    for (const f of cors) expect(f.content).not.toMatch(/Allow-Credentials"?\s*[,"]?\s*"?true/i);
  });
  it("zips the README plus every file", async () => {
    const pack = generateFixPack(demoBundle("agents.samedaydesk.com"));
    const unzipped = unzipSync(await fixPackZip(pack));
    expect(Object.keys(unzipped).sort()).toEqual(["README.md", ...pack.files.map((f) => f.path)].sort());
    expect(strFromU8(unzipped["README.md"])).toContain("Not generated");
  });
});

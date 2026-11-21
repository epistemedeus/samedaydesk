import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [preview, previousCommit] = process.argv.slice(2);
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(preview || ""), "Use the private Node preview");
assert(/^[a-f0-9]{40}$/.test(previousCommit || ""), "Pin the live source sitemap");
const brand = "https://samedaydesk.com";
const attr = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"))?.slice(1).find(v => v !== undefined);
const decode = (s) => s.replaceAll("&amp;", "&");
const count = { redirected: 0, metadata: 0, structuredData: 0 };
const get = (path) => fetch(preview + path, { redirect: "manual", signal: AbortSignal.timeout(8000) });

function paths(xml) {
  return [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    const url = new URL(decode(m[1]));
    assert.equal(url.origin, brand);
    assert(!url.pathname.startsWith("/dev/"), "Development-only path in sitemap");
    return url.pathname + url.search;
  }))].sort();
}

const prior = paths(execFileSync("git", ["show", `${previousCommit}:client/public/sitemap.xml`], { encoding: "utf8" }));
assert(prior.length >= 51);
const sitemap = await get("/sitemap.xml");
assert.equal(sitemap.status, 200);
const current = new Set(paths(await sitemap.text()));
assert(current.size >= 35);
const failures = [];
const union = [...new Set([...prior, ...current])];
for (let i = 0; i < union.length; i += 8) {
  await Promise.all(union.slice(i, i + 8).map(async path => {
    try {
      let response = await get(path);
      if (response.status === 301) {
        assert(!current.has(path), "New sitemap points to a redirect");
        const location = response.headers.get("location");
        assert(location, "Redirect has no Location");
        const url = new URL(location, brand);
        assert.equal(url.origin, brand);
        assert.notEqual(url.pathname + url.search, path, "Redirect loop");
        response = await get(url.pathname + url.search);
        count.redirected++;
      }
      assert.equal(response.status, 200, "Route did not serve in one hop");
      if (!current.has(path) || !response.headers.get("content-type")?.includes("text/html")) return;
      const html = (await response.text()).replace(/<!--[\s\S]*?-->/g, "");
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
      const head = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "").match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] || "";
      assert(/<title>[^<\s][^<]*<\/title>/i.test(head), "Missing title");
      const meta = head.match(/<meta\b[^>]*>/gi) || [];
      assert(meta.some(tag => attr(tag, "name") === "description" && attr(tag, "content")?.trim()), "Missing description");
      assert(!meta.some(tag => attr(tag, "name") === "robots" && /\bnoindex\b/i.test(attr(tag, "content") || "")), "Noindex route listed in sitemap");
      const links = head.match(/<link\b[^>]*>/gi) || [];
      const canonical = links.filter(tag => attr(tag, "rel") === "canonical");
      assert.equal(canonical.length, 1, "One canonical URL required");
      assert.equal(decode(attr(canonical[0], "href") || ""), brand + path, "Canonical disagrees with sitemap");
      count.metadata++;
      for (const [, attributes, json] of scripts) {
        if (attr(attributes, "type")?.toLowerCase() !== "application/ld+json") continue;
        const ld = JSON.parse(json);
        assert(ld && typeof ld === "object", "Invalid structured-data shape");
        count.structuredData++;
      }
    } catch (error) {
      failures.push(`${path}: ${String(error.message).split("\n")[0]}`);
    }
  }));
}
if (failures.length) throw new Error(`Sitemap and metadata failures:\n${failures.sort().join("\n")}`);
console.log(`SDS_SITEMAP_OK prior=${prior.length} current=${current.size} metadata=${count.metadata} redirects=${count.redirected} jsonld=${count.structuredData}`);

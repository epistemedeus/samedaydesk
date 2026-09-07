// Free starter vs paid complete Fix Pack artifacts.
// Starter is intentionally narrower: Organization JSON-LD + AI-crawler robots.txt only.
// Complete adds FAQPage JSON-LD, sitemap.xml, and title/meta/Open Graph guidance.
import dns from "node:dns/promises";
import net from "node:net";

const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot",
];

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  return true;
}

export function normalizeFixPackUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) throw new Error("Provide a url, e.g. example.com");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  const u = new URL(s);
  if (!u.hostname.includes(".")) throw new Error("Enter a full domain, e.g. example.com");
  return u;
}

async function assertPublic(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Not a public host");
    return;
  }
  const addrs = await dns.lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Not a public host");
}

async function fetchText(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 10000);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      redirect: "follow",
      headers: { "User-Agent": "SameDayDeskBot/1.0 (+https://samedaydesk.com)" },
    });
    const buf = Buffer.from((await r.arrayBuffer()).slice(0, 3_000_000));
    return { finalUrl: r.url, body: buf.toString("utf8") };
  } finally {
    clearTimeout(t);
  }
}

const attr = (tag, n) => {
  const m = tag.match(new RegExp(n + '\\s*=\\s*["\']([^"\']*)["\']', "i"));
  return m ? m[1].trim() : null;
};

function analyze(html) {
  const o = { title: null, description: null, og: 0, h1: null, links: [] };
  if (!html) return o;
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (tm) o.title = tm[1].replace(/\s+/g, " ").trim();
  const hm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (hm) o.h1 = hm[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  for (const tag of html.match(/<meta[^>]+>/gi) || []) {
    if ((attr(tag, "name") || "").toLowerCase() === "description") o.description = attr(tag, "content");
    if ((attr(tag, "property") || "").toLowerCase().startsWith("og:")) o.og++;
  }
  for (const a of html.match(/href\s*=\s*["']([^"'#?]+)["']/gi) || []) {
    const m = a.match(/["']([^"']+)["']/);
    if (m && /^\/[a-z]/i.test(m[1])) o.links.push(m[1]);
  }
  return o;
}

async function inspectSite(rawUrl) {
  const u = normalizeFixPackUrl(rawUrl);
  await assertPublic(u.hostname);
  const page = await fetchText(u.toString());
  const origin = new URL(page.finalUrl || u.toString()).origin;
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const a = analyze(page.body);
  const name = (a.title ? a.title.split(/[|\-–—:]/)[0].trim() : host).slice(0, 60) || host;
  const desc = (a.description && a.description.length >= 40 ? a.description : a.h1 || `${name} — see ${host}.`).slice(0, 300);
  return { origin, host, a, name, desc };
}

function organizationJsonLd(site) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.origin,
    description: site.desc,
    logo: `${site.origin}/logo.png`,
  };
}

function faqJsonLd(site) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What does ${site.name} do?`,
        acceptedAnswer: { "@type": "Answer", text: site.desc },
      },
      {
        "@type": "Question",
        name: `Where is ${site.name} located / what area does it serve?`,
        acceptedAnswer: { "@type": "Answer", text: "REPLACE with your address or service area." },
      },
      {
        "@type": "Question",
        name: `How do I contact ${site.name}?`,
        acceptedAnswer: { "@type": "Answer", text: "REPLACE with phone, email, or contact page." },
      },
    ],
  };
}

function robotsTxt(site) {
  return [
    "# AI search engines + crawlers welcome",
    "User-agent: *",
    "Allow: /",
    "",
    ...AI_CRAWLERS.flatMap((ua) => [`User-agent: ${ua}`, "Allow: /", ""]),
    `Sitemap: ${site.origin}/sitemap.xml`,
    "",
  ].join("\n");
}

function sitemapXml(site) {
  const urls = [...new Set([site.origin + "/", ...site.a.links.slice(0, 30).map((l) => site.origin + l)])].slice(0, 25);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map((x) => `  <url><loc>${x}</loc></url>`).join("\n")
    + `\n</urlset>\n`;
}

function titleMetaOgLines(site) {
  const titleRec = site.a.title && site.a.title.length >= 15 && site.a.title.length <= 65
    ? `Title OK (${site.a.title.length} chars).`
    : `Use a 15-65 char title, e.g. "${site.name} — ${(site.a.h1 || "what you do, where").slice(0, 40)}".`;
  const descRec = site.a.description && site.a.description.length >= 70 && site.a.description.length <= 165
    ? `Meta description OK (${site.a.description.length} chars).`
    : `Add a 70-165 char meta description, e.g. "${site.desc.slice(0, 150)}".`;
  const ogRec = site.a.og >= 3
    ? `Open Graph present (${site.a.og} tags).`
    : `Add og:title/og:description/og:url/og:image/og:type.`;
  return [titleRec, descRec, ogRec];
}

/** Free starter: Organization JSON-LD + AI-crawler robots.txt only. */
export async function generateStarterFixPack(rawUrl) {
  const site = await inspectSite(rawUrl);
  const orgLd = organizationJsonLd(site);
  const robots = robotsTxt(site);
  return [
    `# AI-Readiness Free Starter — ${site.host}`,
    "Paste the Organization JSON-LD into your homepage <head> and replace /robots.txt. The paid Fix Pack adds FAQ structured data, a sitemap file, and title/meta/Open Graph fixes tailored to this site.",
    "",
    "## 1. Organization JSON-LD",
    '<script type="application/ld+json">',
    JSON.stringify(orgLd, null, 2),
    "</script>",
    "## 2. robots.txt",
    robots,
    "",
    `Verify after deploying: https://samedaydesk.com/scan?url=${site.host}`,
  ].join("\n");
}

/** Paid complete Fix Pack: all five sections. */
export async function generateCompleteFixPack(rawUrl) {
  const site = await inspectSite(rawUrl);
  const orgLd = organizationJsonLd(site);
  const faqLd = faqJsonLd(site);
  const robots = robotsTxt(site);
  const sitemap = sitemapXml(site);
  const [titleRec, descRec, ogRec] = titleMetaOgLines(site);

  return [
    `# AI-Readiness Fix Pack — ${site.host}`,
    "Paste the JSON-LD into your homepage <head>, replace /robots.txt, upload /sitemap.xml (submit it in Bing Webmaster Tools). Replace any REPLACE placeholders.",
    "",
    "## 1. Organization JSON-LD",
    '<script type="application/ld+json">',
    JSON.stringify(orgLd, null, 2),
    "</script>",
    "## 2. FAQPage JSON-LD",
    '<script type="application/ld+json">',
    JSON.stringify(faqLd, null, 2),
    "</script>",
    "## 3. robots.txt",
    robots,
    "## 4. sitemap.xml",
    sitemap,
    "## 5. Title / meta / Open Graph",
    `- ${titleRec}`,
    `- ${descRec}`,
    `- ${ogRec}`,
    "",
    `Verify after deploying: https://samedaydesk.com/scan?url=${site.host}`,
  ].join("\n");
}

export function starterContainsOnlyAdvertisedSections(text) {
  const body = String(text || "");
  return body.includes("Organization JSON-LD")
    && body.includes("robots.txt")
    && !body.includes('"@type": "FAQPage"')
    && !body.includes("## 4. sitemap.xml")
    && !body.includes("## 5. Title / meta / Open Graph");
}

export function completeContainsFullSections(text) {
  const body = String(text || "");
  return body.includes("Organization JSON-LD")
    && body.includes("FAQPage")
    && body.includes("robots.txt")
    && body.includes("## 4. sitemap.xml")
    && body.includes("## 5. Title / meta / Open Graph");
}

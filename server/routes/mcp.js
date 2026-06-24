// Remote (Streamable HTTP) MCP server. Lets web/remote MCP clients — ChatGPT
// connectors, Claude.ai custom connectors, and any client that supports a remote
// MCP URL — use the AI-readiness checker over HTTPS at https://samedaydesk.com/mcp
// (no install). Reuses runCheck() from tools.js. Stateless + CORS-enabled.
//
// Also exposes a PAID tool (generate_complete_fix_pack) redeemed inline with a
// Stripe checkout-session license, so a developer can buy + receive the full Fix
// Pack from inside their AI client. The purchase happens at the Payment Link
// (standard Stripe); this just validates + delivers, with a graceful fallback.
import { Router } from "express";
import dns from "node:dns/promises";
import net from "node:net";
import { runCheck } from "./tools.js";
import { stripe, isStripeConfigured } from "../lib/stripe.js";

const router = Router();

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "samedaydesk-ai-readiness", version: "1.1.0" };
const FIXPACK_LINK = "https://buy.stripe.com/8x24gA0xA9DF9dd13YeZ20h"; // $39 instant Fix Pack
const FIXPACK_MIN_CENTS = 3900;

const TOOLS = [
  {
    name: "check_ai_readiness",
    description:
      "Check whether a website is visible to AI search engines (ChatGPT, Perplexity, Claude, Google AI Overviews). " +
      "Scores AI-crawler access, JSON-LD structured data, title/meta, Open Graph, sitemap, and llms.txt, and returns " +
      "a 0-100 score, a letter grade, and a specific fix for each gap. Free.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The website to check, e.g. example.com or https://example.com" },
      },
      required: ["url"],
    },
  },
  {
    name: "generate_complete_fix_pack",
    description:
      "PAID. Returns the complete, ready-to-paste AI-readiness Fix Pack for a site: tailored Organization + FAQPage " +
      "JSON-LD, an AI-crawler robots.txt, a sitemap, and title/meta/Open Graph fixes. Requires a `license` — the " +
      `checkout-session id you receive after buying the $39 Fix Pack at ${FIXPACK_LINK} (after paying you're shown ` +
      "your license code). Without a valid license it returns purchase instructions plus a free starter pack.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The website to generate the Fix Pack for." },
        license: { type: "string", description: "Your Stripe checkout-session license code (starts with cs_)." },
      },
      required: ["url"],
    },
  },
];

const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot",
];

const okMsg = (id, result) => ({ jsonrpc: "2.0", id, result });
const errMsg = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

// ---- SSRF-guarded fetch + analysis (URL is user-provided) -------------------
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(ip)) { const v = ip.toLowerCase(); return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:"); }
  return true;
}
function normalizeUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) throw new Error("Provide a url, e.g. example.com");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  const u = new URL(s);
  if (!u.hostname.includes(".")) throw new Error("Enter a full domain, e.g. example.com");
  return u;
}
async function assertPublic(hostname) {
  if (net.isIP(hostname)) { if (isPrivateIp(hostname)) throw new Error("Not a public host"); return; }
  const addrs = await dns.lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Not a public host");
}
async function fetchText(url) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 10000);
  try {
    const r = await fetch(url, { signal: c.signal, redirect: "follow", headers: { "User-Agent": "SameDayDeskBot/1.0 (+https://samedaydesk.com)" } });
    const buf = Buffer.from((await r.arrayBuffer()).slice(0, 3_000_000));
    return { finalUrl: r.url, body: buf.toString("utf8") };
  } finally { clearTimeout(t); }
}
const attr = (tag, n) => { const m = tag.match(new RegExp(n + '\\s*=\\s*["\']([^"\']*)["\']', "i")); return m ? m[1].trim() : null; };
function analyze(html) {
  const o = { title: null, description: null, og: 0, h1: null, links: [] };
  if (!html) return o;
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (tm) o.title = tm[1].replace(/\s+/g, " ").trim();
  const hm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); if (hm) o.h1 = hm[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  for (const tag of html.match(/<meta[^>]+>/gi) || []) {
    if ((attr(tag, "name") || "").toLowerCase() === "description") o.description = attr(tag, "content");
    if ((attr(tag, "property") || "").toLowerCase().startsWith("og:")) o.og++;
  }
  for (const a of html.match(/href\s*=\s*["']([^"'#?]+)["']/gi) || []) {
    const m = a.match(/["']([^"']+)["']/); if (m && /^\/[a-z]/i.test(m[1])) o.links.push(m[1]);
  }
  return o;
}

async function generateCompleteFixPack(rawUrl) {
  const u = normalizeUrl(rawUrl);
  await assertPublic(u.hostname);
  const page = await fetchText(u.toString());
  const origin = new URL(page.finalUrl || u.toString()).origin;
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const a = analyze(page.body);
  const name = (a.title ? a.title.split(/[|\-–—:]/)[0].trim() : host).slice(0, 60) || host;
  const desc = (a.description && a.description.length >= 40 ? a.description : a.h1 || `${name} — see ${host}.`).slice(0, 300);

  const orgLd = { "@context": "https://schema.org", "@type": "Organization", name, url: origin, description: desc, logo: `${origin}/logo.png` };
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: `What does ${name} do?`, acceptedAnswer: { "@type": "Answer", text: desc } },
      { "@type": "Question", name: `Where is ${name} located / what area does it serve?`, acceptedAnswer: { "@type": "Answer", text: "REPLACE with your address or service area." } },
      { "@type": "Question", name: `How do I contact ${name}?`, acceptedAnswer: { "@type": "Answer", text: "REPLACE with phone, email, or contact page." } },
    ],
  };
  const robots = ["# AI search engines + crawlers welcome", "User-agent: *", "Allow: /", "", ...AI_CRAWLERS.flatMap((ua) => [`User-agent: ${ua}`, "Allow: /", ""]), `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
  const urls = [...new Set([origin + "/", ...a.links.slice(0, 30).map((l) => origin + l)])].slice(0, 25);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` + urls.map((x) => `  <url><loc>${x}</loc></url>`).join("\n") + `\n</urlset>\n`;
  const titleRec = a.title && a.title.length >= 15 && a.title.length <= 65 ? `Title OK (${a.title.length} chars).` : `Use a 15-65 char title, e.g. "${name} — ${(a.h1 || "what you do, where").slice(0, 40)}".`;
  const descRec = a.description && a.description.length >= 70 && a.description.length <= 165 ? `Meta description OK (${a.description.length} chars).` : `Add a 70-165 char meta description, e.g. "${desc.slice(0, 150)}".`;
  const ogRec = a.og >= 3 ? `Open Graph present (${a.og} tags).` : `Add og:title/og:description/og:url/og:image/og:type.`;

  return [
    `# AI-Readiness Fix Pack — ${host}`,
    "Paste the JSON-LD into your homepage <head>, replace /robots.txt, upload /sitemap.xml (submit it in Bing Webmaster Tools). Replace any REPLACE placeholders.",
    "",
    "## 1. Organization JSON-LD",
    '<script type="application/ld+json">', JSON.stringify(orgLd, null, 2), "</script>",
    "## 2. FAQPage JSON-LD",
    '<script type="application/ld+json">', JSON.stringify(faqLd, null, 2), "</script>",
    "## 3. robots.txt", robots,
    "## 4. sitemap.xml", sitemap,
    "## 5. Title / meta / Open Graph", `- ${titleRec}`, `- ${descRec}`, `- ${ogRec}`,
    "", `Verify after deploying: https://samedaydesk.com/scan?url=${host}`,
  ].join("\n");
}

async function validateLicense(license) {
  const id = String(license || "").trim();
  if (!isStripeConfigured() || !/^cs_/.test(id)) return false;
  try {
    const s = await stripe.checkout.sessions.retrieve(id);
    return s && s.payment_status === "paid" && (s.amount_total || 0) >= FIXPACK_MIN_CENTS;
  } catch {
    return false;
  }
}

function formatReport(r) {
  const lines = [`AI Readiness for ${r.url}`, `Score: ${r.score}/100   Grade: ${r.grade}`, ""];
  for (const c of r.checks || []) {
    lines.push(`[${String(c.status).toUpperCase()}] ${c.label} — ${c.detail}`);
    if (c.fix) lines.push(`       fix: ${c.fix}`);
  }
  lines.push("");
  const gaps = (r.checks || []).filter((c) => c.status !== "pass").length;
  lines.push(
    gaps > 0
      ? `${gaps} gap(s) found. Get the complete, ready-to-paste Fix Pack instantly: buy the $39 Fix Pack at ${FIXPACK_LINK} ` +
          `(you'll be shown a license code), then call generate_complete_fix_pack with url + that license. Full report: https://samedaydesk.com/scan?url=${encodeURIComponent(r.url)}`
      : `Clean bill of health. For deep citation testing vs competitors, see the AI-Search Visibility Audit at https://samedaydesk.com/`,
  );
  return lines.join("\n");
}

async function handle(msg) {
  const { id, method, params } = msg || {};
  switch (method) {
    case "initialize":
      return okMsg(id, { protocolVersion: params?.protocolVersion || PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return okMsg(id, {});
    case "tools/list":
      return okMsg(id, { tools: TOOLS });
    case "tools/call": {
      const name = params?.name;
      const url = String(params?.arguments?.url || "").trim();
      if (name !== "check_ai_readiness" && name !== "generate_complete_fix_pack")
        return errMsg(id, -32602, `Unknown tool: ${name}`);
      if (!url) return okMsg(id, { content: [{ type: "text", text: "Provide a url, e.g. example.com" }], isError: true });

      if (name === "generate_complete_fix_pack") {
        const license = params?.arguments?.license;
        const paid = await validateLicense(license);
        if (!paid) {
          let starter = "";
          try { starter = "\n\nMeanwhile, here's a free starter (Organization JSON-LD + AI-crawler robots.txt). The paid Fix Pack adds the full FAQ, sitemap, and meta/OG, tailored:\n\n" + (await generateCompleteFixPack(url)); } catch { /* ignore */ }
          const why = license ? "That license code couldn't be verified as a paid Fix Pack (if you just paid, wait ~30s and retry, or contact help@samedaydesk.com)." : "No license provided.";
          return okMsg(id, {
            content: [{ type: "text", text: `${why}\n\nTo get the complete Fix Pack: buy at ${FIXPACK_LINK} ($39). After paying you'll see your license code; call this tool again with url + that license.${starter}` }],
            isError: true,
          });
        }
        try {
          const pack = await generateCompleteFixPack(url);
          return okMsg(id, { content: [{ type: "text", text: `✅ Verified. Your complete AI-Readiness Fix Pack:\n\n${pack}` }] });
        } catch (e) {
          // Payment is valid but generation failed — never lose a paid order.
          return okMsg(id, { content: [{ type: "text", text: `Your payment is verified, but auto-generation hit an error (${e.message}). Email help@samedaydesk.com with your url (${url}) and license and we'll deliver your Fix Pack right away.` }], isError: true });
        }
      }

      try {
        const r = await runCheck(url);
        return okMsg(id, { content: [{ type: "text", text: formatReport(r) }], structuredContent: r });
      } catch (e) {
        return okMsg(id, { content: [{ type: "text", text: `Could not check ${url}: ${e.message}` }], isError: true });
      }
    }
    default:
      return id !== undefined ? errMsg(id, -32601, `Method not found: ${method}`) : null;
  }
}

router.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
  });
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// GET /mcp?cs=<session> is where Stripe redirects after a Fix Pack purchase —
// show the buyer their license code + how to redeem it.
router.get("/", (req, res) => {
  const cs = String(req.query.cs || "").trim();
  if (cs) {
    return res.type("text/plain").send(
      `Thanks for your purchase! Your AI-Readiness Fix Pack license code:\n\n${cs}\n\n` +
        `Redeem it in your AI client: call the MCP tool generate_complete_fix_pack with your site url and license="${cs}".\n` +
        `Trouble? Email help@samedaydesk.com with this code.\n`,
    );
  }
  res.type("text/plain").send(
    "samedaydesk AI-readiness MCP server (Streamable HTTP).\n" +
      'Add to a remote-MCP-capable client: { "mcpServers": { "ai-readiness": { "url": "https://samedaydesk.com/mcp" } } }\n' +
      "Tools: check_ai_readiness(url) [free], generate_complete_fix_pack(url, license) [paid]. Free UI: https://samedaydesk.com/tools/ai-readiness\n",
  );
});

router.post("/", async (req, res) => {
  const msg = req.body;
  try {
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map(handle))).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await handle(msg);
    if (!out) return res.status(202).end();
    return res.json(out);
  } catch (e) {
    return res.status(500).json(errMsg(msg?.id ?? null, -32603, e.message));
  }
});

export default router;

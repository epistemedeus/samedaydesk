import { createHash } from "node:crypto";
import { parse } from "parse5";
import { fetchPublicBounded } from "./agent-readiness/bounded-fetch.js";
import { looksLikeChallenge } from "./agent-readiness/retrieval.js";

// Only these primary sources can burn an official Watch read or appear in its mail.
// Match material content before making a baseline. The markers identify the subject,
// not amounts or eligibility rules that we expect to detect changing.
export const officialPages = Object.freeze({
  "delaware-annual": ["Delaware LLC annual tax", "https://corp.delaware.gov/alt-entitytaxinstructions/", /annual tax/i],
  "delaware-fee-index": ["Delaware filing fee schedule index", "https://corp.delaware.gov/fee/", /corporate fee schedule/i],
  "delaware-fees": ["Delaware filing fees", "https://corpfiles.delaware.gov/Fee_Schedule/AugustFee2026.pdf"],
  "wyoming-fees": ["Wyoming filing fees", "https://sos.wyo.gov/Business/Docs/BusinessFees.pdf"],
  "new-mexico-fee-index": ["New Mexico corporations statute index", "https://nmonesource.com/nmos/nmsa/en/item/4400/index.do?iframe=true", /chapter 53/i],
  "new-mexico-fees": ["New Mexico corporations statutes including LLC fees", "https://nmonesource.com/nmos/nmsa/en/4400/1/document.do"],
  "irs-ss4": ["IRS Form SS-4", "https://www.irs.gov/forms-pubs/about-form-ss-4", /Form SS-4/i],
  "irs-ein": ["IRS employer identification numbers", "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number", /Employer identification number/i],
  "irs-5472": ["IRS Form 5472", "https://www.irs.gov/forms-pubs/about-form-5472", /Form 5472/i],
  "play-locations": ["Google Play supported locations", "https://support.google.com/googleplay/android-developer/answer/9306917?hl=en", /merchant registration/i],
  "play-account": ["Google Play developer account requirements", "https://support.google.com/googleplay/android-developer/answer/13628312?hl=en", /developer account/i],
  "apple-enrollment": ["Apple Developer Program enrollment", "https://developer.apple.com/help/account/membership/program-enrollment/", /legal entity/i],
  "stripe-locations": ["Stripe supported countries", "https://stripe.com/global", /supported countries|global availability|stripe is available/i],
  "paypal-locations": ["PayPal REST payment supported countries", "https://developer.paypal.com/api/codes/country-region/", /country and region codes/i, "nd-page"],
  duns: ["Dun & Bradstreet D-U-N-S Number", "https://www.dnb.com/en-us/smb/duns/get-a-duns.html", /D-U-N-S/i],
  fincen: ["FinCEN beneficial ownership information", "https://www.fincen.gov/boi", /beneficial ownership/i],
});

export const officialWatch = Object.freeze({
  order: "505a0b26-a89a-4f45-8d2a-a3e1780ef6c6",
  window: "official-watch-owner-window-v1",
  tag: "official-watch-owner-v1",
  recipient: "contact@samedaydesk.com",
});
export const officialDigest = /^[a-f0-9]{64}$/;
export const isOfficialPage = (id) => typeof id === "string" && Object.hasOwn(officialPages, id);
export function officialSourceTask(target, observedAt, beforeSha256, afterSha256) {
  const [label, url] = officialPages[target];
  return { schema: "sds.watch.official-source-task.v1", action: "review_official_source",
    target, label, url, observedAt, beforeSha256, afterSha256 };
}
const skip = new Set(["script", "style", "noscript", "template", "svg", "nav", "footer", "form", "aside"]);
const attr = (node, key) => node.attrs?.find(item => item.name === key)?.value;
const isMain = (node) => node.tagName === "main" || attr(node, "role") === "main";

function documentText(html, articleId) {
  const main = [], body = [];
  function collect(node, insideMain) {
    if (skip.has(node.tagName) || attr(node, "aria-hidden") === "true" || attr(node, "hidden") !== undefined) return;
    const active = insideMain || isMain(node);
    // Tables can signal availability via alt or ARIA labels rather than printed words.
    const href = attr(node, "href");
    const label = node.nodeName === "#text" ? node.value : attr(node, "alt") || attr(node, "aria-label");
    if (label) (active ? main : body).push(label);
    if (href && /\.pdf(?:$|[?#])|^\/nmos\/nmsa\/en\/\d+\/\d+\/document\.do$/i.test(href)) {
      (active ? main : body).push(href);
    }
    for (const child of node.childNodes || []) collect(child, active);
  }
  const doc = parse(html);
  if (articleId) {
    // This provider streams the finished article in a hidden container. Select
    // its named article directly, without evaluating the relocation script.
    function findArticle(node) {
      if (node.tagName === "article" && attr(node, "id") === articleId) collect(node, true);
      else for (const child of node.childNodes || []) findArticle(child);
    }
    findArticle(doc);
  } else collect(doc, false);
  return (main.length ? main : body).join(" ").normalize("NFC").replace(/\s+/gu, " ").trim();
}

export async function readOfficialPage(id, { exchange = fetchPublicBounded, lookup } = {}) {
  if (!isOfficialPage(id)) throw new Error("unknown_official_target");
  const [, href, marker, articleId] = officialPages[id];
  const url = new URL(href);
  const result = await exchange(url, {
    allowedOrigin: url.origin, maxRedirects: 0, maxBytes: 2_500_000, timeoutMs: 6_000,
    responseBytes: !marker, includeHeaders: true, lookup,
    headers: { accept: marker ? "text/html" : "application/pdf", "accept-language": "en" },
  });
  if (!result.ok || result.status !== 200 || result.finalUrl !== href || result.redirects.length || result.oversize) {
    throw new Error("official_page_unavailable");
  }
  let content;
  if (marker) {
    if (!/^text\/html(?:;|$)/i.test(result.contentType) || looksLikeChallenge(result)) throw new Error("official_page_unavailable");
    content = documentText(result.body, articleId);
    if (content.length < 80 || !marker.test(content)) throw new Error("official_subject_unavailable");
  } else {
    content = result.body;
    if (!/^application\/pdf(?:;|$)/i.test(result.contentType) || !Buffer.isBuffer(content) ||
        content.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("official_pdf_unavailable");
  }
  return createHash("sha256").update(content).digest("hex");
}

export async function runOfficialWatch({ watch, at, read = readOfficialPage }) {
  const counts = { enrolled: false, attempted: 0, baseline: 0, unchanged: 0, changed: 0, skipped: 0, issues: [] };
  const targets = await watch.officialTargets(at);
  if (targets === null) return counts;
  counts.enrolled = true;
  if (!Array.isArray(targets) || targets.length > Object.keys(officialPages).length ||
      targets.some(id => !isOfficialPage(id)) || new Set(targets).size !== targets.length) {
    counts.issues.push("official_enrollment_invalid");
    return counts;
  }
  for (const id of targets) {
    counts.attempted++;
    let digest;
    try { digest = await read(id); }
    catch { counts.issues.push(id + ":read_failed"); continue; }
    try { counts[await watch.observeOfficialPage({ id, digest, at })]++; }
    catch {
      // A lost database response can include a stored observation or claim.
      // Receive it from existing state rather than running this observation again.
      counts.issues.push(id + ":observation_unreceived");
      break;
    }
  }
  return counts;
}

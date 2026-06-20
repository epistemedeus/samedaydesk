// Profile-picture / logo concept explorations for SameDayDesk.
// Red ground, white double-chevron, combined with the "samedaydesk" wordmark several ways.
// Square 1000x1000, circular-crop safe. Run from client/:  node brand/make-profile.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const F = {
  SG: "node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
  JM: "node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
};
const face = (fam, p) =>
  `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${readFileSync(p).toString("base64")}) format('woff2');font-weight:100 900;font-style:normal;font-display:block;}`;
const FONTS = `<style>${face("SG", F.SG)}${face("JM", F.JM)}</style>`;

const RED = "#9E3B2E";   // brand oxide
const BONE = "#F4F1EA";
const WHITE = "#FBF8F2"; // warm white

// Double-chevron, base geometry on a 100 grid (center ~ 52,50). Scale s, center (cx,cy).
const arrows = (cx, cy, s, fill) =>
  `<g transform="translate(${cx - 52 * s},${cy - 50 * s}) scale(${s})" fill="${fill}">` +
  `<path d="M33 29 L51 50 L33 71 Z"/><path d="M53 29 L71 50 L53 71 Z"/></g>`;

const wrap = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1000" height="1000" viewBox="0 0 1000 1000"><defs>${FONTS}</defs>${inner}</svg>`;

const variants = {};

// V1 — Dispatch Seal: a circular stamp, curved wordmark, arrow in the middle.
variants["v1-seal"] = wrap(`
  <rect width="1000" height="1000" fill="${RED}"/>
  <circle cx="500" cy="500" r="472" fill="none" stroke="${WHITE}" stroke-width="4"/>
  <circle cx="500" cy="500" r="452" fill="none" stroke="${WHITE}" stroke-width="9"/>
  <circle cx="500" cy="500" r="268" fill="none" stroke="${WHITE}" stroke-width="2" opacity="0.7"/>
  <defs>
    <path id="arcTop" d="M 130 500 A 370 370 0 0 1 870 500" fill="none"/>
    <path id="arcBot" d="M 130 500 A 370 370 0 0 0 870 500" fill="none"/>
  </defs>
  <text font-family="JM" font-weight="600" font-size="62" letter-spacing="16" fill="${WHITE}">
    <textPath xlink:href="#arcTop" startOffset="50%" text-anchor="middle">SAMEDAYDESK</textPath>
  </text>
  <text font-family="JM" font-weight="500" font-size="44" letter-spacing="11" fill="${WHITE}">
    <textPath xlink:href="#arcBot" startOffset="50%" text-anchor="middle">SAME-DAY DESK</textPath>
  </text>
  <circle cx="130" cy="500" r="8" fill="${WHITE}"/>
  <circle cx="870" cy="500" r="8" fill="${WHITE}"/>
  ${arrows(505, 500, 4.4, WHITE)}
`);

// V2 — Stacked: arrow over the lowercase wordmark.
variants["v2-stacked"] = wrap(`
  <rect width="1000" height="1000" fill="${RED}"/>
  ${arrows(500, 388, 6.2, WHITE)}
  <text x="500" y="700" text-anchor="middle" font-family="SG" font-weight="600" font-size="116" letter-spacing="-3" fill="${WHITE}">samedaydesk</text>
`);

// V3 — Inline lockup: arrow and wordmark side by side, the horizontal logo.
variants["v3-inline"] = wrap(`
  <rect width="1000" height="1000" fill="${RED}"/>
  ${arrows(238, 500, 3.0, WHITE)}
  <text x="330" y="534" font-family="SG" font-weight="600" font-size="98" letter-spacing="-3" fill="${WHITE}">samedaydesk</text>
`);

// V4 — Editorial stack: SAME / DAY / DESK in tight caps, arrow as a top accent.
variants["v4-editorial"] = wrap(`
  <rect width="1000" height="1000" fill="${RED}"/>
  ${arrows(500, 205, 2.2, WHITE)}
  <g text-anchor="middle" font-family="SG" font-weight="700" fill="${WHITE}" font-size="158" letter-spacing="-5">
    <text x="500" y="455">SAME</text>
    <text x="500" y="610">DAY</text>
    <text x="500" y="765">DESK</text>
  </g>
`);

// V5 — Arrow-forward: a big mark with a small mono caption along the base.
variants["v5-arrow"] = wrap(`
  <rect width="1000" height="1000" fill="${RED}"/>
  ${arrows(500, 430, 8.4, WHITE)}
  <line x1="320" y1="772" x2="680" y2="772" stroke="${WHITE}" stroke-width="2" opacity="0.6"/>
  <text x="500" y="836" text-anchor="middle" font-family="JM" font-weight="500" font-size="50" letter-spacing="17" fill="${WHITE}">SAMEDAYDESK</text>
`);

// V6 — Bone inverse: the Drafting Table cut (oxide on bone) with a registration ring.
variants["v6-inverse"] = wrap(`
  <rect width="1000" height="1000" fill="${BONE}"/>
  <circle cx="500" cy="500" r="432" fill="none" stroke="${RED}" stroke-width="2" opacity="0.4"/>
  ${arrows(500, 392, 6.0, RED)}
  <text x="500" y="700" text-anchor="middle" font-family="SG" font-weight="600" font-size="112" letter-spacing="-3" fill="${RED}">samedaydesk</text>
`);

mkdirSync("brand/explore", { recursive: true });
for (const [name, svg] of Object.entries(variants)) {
  writeFileSync(`brand/explore/${name}.svg`, svg);
}
console.log("wrote", Object.keys(variants).length, "variants:", Object.keys(variants).join(", "));

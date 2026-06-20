// Generates the social-share card (client/public/og.png) for SameDayDesk.
// Authors an SVG with the real brand fonts embedded (so WebKit/qlmanage renders them),
// then the shell step rasterizes it. Run: node brand/make-og.mjs  (from client/)
import { readFileSync, writeFileSync } from "node:fs";

const FONTS = {
  SG: "node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
  IN: "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  JM: "node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
};
const face = (fam, path) =>
  `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${readFileSync(path).toString("base64")}) format('woff2');font-weight:100 900;font-style:normal;font-display:block;}`;

// Brand mark (the Same-Day Stamp), same geometry as BrandMark.tsx, on a 100-unit grid.
const mark = (x, y, s) => `
  <g transform="translate(${x},${y}) scale(${s / 100})">
    <rect x="6" y="6" width="88" height="88" rx="20" fill="#ccff00"/>
    <path d="M33 29 L51 50 L33 71 Z" fill="#0a0b0d"/>
    <path d="M53 29 L71 50 L53 71 Z" fill="#0a0b0d"/>
  </g>`;

// Canvas is square (qlmanage thumbnails to a square), with the real 1200x630 card centered as
// the middle band (viewBox min-y = -285). A centered 2:1 crop after rasterizing lands exactly
// on content y 0..630, so nothing shifts.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 -285 1200 1200">
  <defs>
    <style>
      ${face("SG", FONTS.SG)}
      ${face("IN", FONTS.IN)}
      ${face("JM", FONTS.JM)}
    </style>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ccff00" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#ccff00" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="22"/></filter>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M60 0 H0 V60" fill="none" stroke="#f4f4f0" stroke-opacity="0.045" stroke-width="1"/>
    </pattern>
    <linearGradient id="gridfade" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="1"/>
    </linearGradient>
    <mask id="gm"><rect width="1200" height="630" fill="url(#gridfade)"/></mask>
  </defs>

  <rect x="0" y="-285" width="1200" height="1200" fill="#0a0b0d"/>
  <rect width="1200" height="630" fill="url(#grid)" mask="url(#gm)"/>
  <ellipse cx="1080" cy="90" rx="360" ry="320" fill="url(#glow)" filter="url(#soft)"/>

  <!-- brand lockup -->
  ${mark(80, 70, 56)}
  <text x="150" y="112" font-family="SG" font-weight="600" font-size="34" letter-spacing="-0.5" fill="#f4f4f0">SameDayDesk</text>
  <text x="1120" y="110" text-anchor="end" font-family="JM" font-weight="500" font-size="19" letter-spacing="1" fill="#6b7178">samedaydesk.com</text>

  <!-- eyebrow -->
  <rect x="80" y="285" width="12" height="12" rx="2" fill="#ccff00"/>
  <text x="106" y="297" font-family="JM" font-weight="500" font-size="19" letter-spacing="4" fill="#a7abb1">SAME-DAY · DONE-FOR-YOU DESK</text>

  <!-- headline -->
  <text x="78" y="392" font-family="SG" font-weight="600" font-size="60" letter-spacing="-1.5" fill="#f4f4f0">Hand off the busywork.</text>
  <text x="78" y="470" font-family="SG" font-weight="600" font-size="60" letter-spacing="-1.5" fill="#f4f4f0">Get it back <tspan fill="#ccff00">today</tspan>.</text>

  <!-- subline -->
  <text x="80" y="545" font-family="IN" font-weight="400" font-size="22" letter-spacing="0" fill="#a7abb1">Résumés, LinkedIn, cover letters, copy. Delivered in hours.</text>
</svg>`;

writeFileSync("brand/og.svg", svg);
console.log("wrote brand/og.svg", svg.length, "bytes");

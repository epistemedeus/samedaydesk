#!/usr/bin/env node
// Public copy check: finds text on a customer-facing page that reports our own
// state or process instead of selling. Rules: overview/grand-phase/06-SELLING-RULES.md
//
//   node public-copy-check.mjs [--site neomorphic|samedaydesk|ein] [--json] <file-or-dir>...
//
// Reads .html .txt .md .astro .tsx .jsx .json files, strips markup, and reports
// each finding with its class. Exit 1 when a "block" finding exists, else 0.
// Legal pages (terms, privacy, disclosures) and long-form guides are exempt from
// the "warn" classes: they are where limits and explanations belong.

import {readFile, readdir, stat} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';

const args = process.argv.slice(2);
const json = args.includes('--json');
const siteAt = args.indexOf('--site');
const site = siteAt >= 0 ? args[siteAt + 1] : '';
const inputs = args.filter((a, i) => !a.startsWith('--') && i !== siteAt + 1);
if (!inputs.length) {
  console.error('Usage: node public-copy-check.mjs [--site neomorphic|samedaydesk|ein] [--json] <file-or-dir>...');
  process.exit(2);
}

// block: must never ship. warn: rewrite or move unless the sentence helps the visitor decide.
const rules = [
  {cls: 'internal-name', level: 'block', re: /\bPilot\b(?! (?:program|project|customer))|\bAlpha (?:desk|hunt|round)\b|\bN-(?:LAB|BTY)-\d+\b|\bH15-BEE\b|\bSol handoff\b|\b(?:lane|gate|stage) [A-Z]\d?\b|\bowner QA\b|\bprivate controller\b/g},
  {cls: 'cross-brand-legal', level: 'block', sites: ['samedaydesk', 'ein'], re: /\bNeomorphic LLC\b|\bportfolio (?:product|service|boundary)\b|\btrade name or DBA\b/g},
  {cls: 'status-confession', level: 'block', re: /\bnot (?:yet )?(?:launched|established|published|available)\b|\bin build\b|\bcoming soon\b|\bprice hypothes[ie]s\b|\binternal (?:prototype|candidate|research preview)\b|\bno live (?:listings|liquidity|offers)\b|\bzero admitted\b|\bzeroes remain visible\b|\b(?:demand|revenue|use) (?:is|remains?|are) unproved\b|\bexternal paid demand\b|\bnot a (?:product|second storefront)\b|\bstaged (?:surface|state|experiment)\b/gi},
  {cls: 'zero-counter', level: 'block', re: /(?:^|\n)\s*0\s*\n\s*(?:External|Externally|live|paid|admitted)[^\n]{0,60}/g},
  {cls: 'evidence-vocabulary', level: 'warn', re: /\bevidence class(?:es)?\b|\bkill condition\b|\bexternal[- ]attributable\b|\bsponsored (?:trial|evidence|review|activity)\b|\brecruited (?:validation|customer)\b|\bowner proof\b|\bbuyer demand\b|\bsynthetic[- ](?:kit|fixture)\b|\bfirst-party (?:records|tests)\b|\bsource class\b/gi},
  {cls: 'negative-self-definition', level: 'warn', re: /\b(?:Neomorphic|SameDayDesk|EIN\.LLC|we|this (?:page|site|service|desk|branch)|it) (?:is|are) not (?:a|an|the) [a-z -]{3,60}|\bdoes not (?:hold|establish|prove|imply|represent|claim|launch|freeze|start)\b|\bnot (?:a|an) (?:bank|custodian|marketplace|payment network|certification authority|job board|promise|guarantee|certificate|legal)\b/gi},
  {cls: 'process-jargon', level: 'warn', re: /\bbounded (?:scope|purpose|operation|launch|learning|route count|validation|public)\b|\bacceptance (?:condition|check)s?\b|\bdocket\b|\bhypothes[ie]s\b|\bfixture\b|\battribution chain\b|\bauthority boundary\b/gi},
];

const exts = new Set(['.html', '.txt', '.md', '.astro', '.tsx', '.jsx', '.json']);
const exempt = /(?:^|[/_.-])(?:terms|privacy|disclosures|legal|guides?|blocked|reports?|docs|research)(?:[/_.-]|$)/i;

const toText = (source) => source
  .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<(?:br|\/p|\/h[1-6]|\/li|\/div|\/tr|\/section|\/dt|\/dd|\/a|\/button|\/td|\/th)[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&rsquo;|&#39;/g, "'")
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

const walk = async (p) => {
  const s = await stat(p);
  if (s.isFile()) return exts.has(extname(p)) ? [p] : [];
  const out = [];
  for (const name of await readdir(p)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    out.push(...await walk(join(p, name)));
  }
  return out;
};

const files = (await Promise.all(inputs.map((i) => walk(resolve(i))))).flat();
const report = [];
const totals = {};
for (const file of files) {
  const text = toText(await readFile(file, 'utf8'));
  const soft = exempt.test(file);
  const findings = [];
  for (const rule of rules) {
    if (rule.sites && site && !rule.sites.includes(site)) continue;
    if (rule.sites && !site) continue;
    if (soft && rule.level === 'warn') continue;
    for (const m of text.matchAll(rule.re)) {
      findings.push({cls: rule.cls, level: rule.level, quote: m[0].replace(/\s+/g, ' ').trim().slice(0, 120)});
      totals[rule.cls] = (totals[rule.cls] || 0) + 1;
    }
  }
  if (findings.length) report.push({file, block: findings.filter((f) => f.level === 'block').length, warn: findings.filter((f) => f.level === 'warn').length, findings});
}

const blocked = report.reduce((n, r) => n + r.block, 0);
if (json) {
  console.log(JSON.stringify({site, files: files.length, files_with_findings: report.length, totals, report}, null, 2));
} else {
  report.sort((a, b) => (b.block - a.block) || (b.warn - a.warn));
  for (const r of report) {
    console.log(`${String(r.block).padStart(3)} block ${String(r.warn).padStart(3)} warn  ${r.file}`);
  }
  console.log(`\n${files.length} files, ${report.length} with findings. ${JSON.stringify(totals)}`);
}
process.exit(blocked ? 1 : 0);

/**
 * Feed capture prep for s134-rss-atom-brief.
 * Distinguishes live no-change from labeled synthetic correction/dedup demos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { refuse, isProbablyHtml } from './refuse-unsupported.mjs';

export function prepareFeedCapture(filePath, { allowSynthetic = true } = {}) {
  if (!fs.existsSync(filePath)) return refuse('missing-feed-capture', 'feed capture missing', { path: filePath });
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) return refuse('empty-feed-capture', 'feed capture empty', { path: filePath });
  if (isProbablyHtml(text)) {
    return refuse('non-feed-html', 'HTML is not a comparable feed snapshot (S147 F6)', { path: filePath });
  }
  const synthetic = /synthetic/i.test(path.basename(filePath));
  if (synthetic && !allowSynthetic) {
    return refuse('synthetic-not-allowed', 'synthetic feed disabled by caller', { path: filePath });
  }
  return {
    ok: true,
    path: filePath,
    synthetic,
    bytes: Buffer.byteLength(text),
    retain: ['sourceUrl', 'license', 'format', 'synthetic'],
    paidValueClaim: false,
  };
}

export function buildFeedCliArgs({ before, after, s134Root, allowSynthetic = true }) {
  const b = prepareFeedCapture(before, { allowSynthetic });
  if (!b.ok) return b;
  const a = prepareFeedCapture(after, { allowSynthetic });
  if (!a.ok) return a;
  const cli = path.join(s134Root, 'modules/rss-atom-brief/cli.mjs');
  return {
    ok: true,
    argv: [cli, '--before', before, '--after', after],
    before: b,
    after: a,
    note: b.synthetic || a.synthetic ? 'SYNTHETIC labeled pair — not a live-feed observation' : 'live or captured primary pair',
  };
}

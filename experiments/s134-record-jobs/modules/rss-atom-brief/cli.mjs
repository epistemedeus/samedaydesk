/**
 * RSS/Atom correction + dedup change brief (offline).
 * Parses two supplied feed XML files with fast-xml-parser.
 * Does not fetch feeds, send notifications, or claim paid monitoring value.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { emit, parseArgs, uncertainty, FREE_BASELINE, stableSort } from '../../lib/common.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  processEntities: false,
  allowBooleanAttributes: true,
});

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function textOf(v) {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if (v['#text'] != null) return String(v['#text']);
    if (v['@_href']) return String(v['@_href']);
  }
  return null;
}

export function parseFeed(xmlText, label) {
  const uncertainties = [];
  const raw = String(xmlText ?? '').trim();
  if (!raw) {
    return {
      ok: true,
      label,
      kind: 'empty',
      items: [],
      uncertainties: [uncertainty('empty-feed', `${label} XML is empty`)],
    };
  }
  let doc;
  try {
    doc = parser.parse(raw);
  } catch (e) {
    return {
      ok: false,
      error: 'xml-parse-error',
      detail: String(e.message || e),
      label,
      kind: 'unknown',
      items: [],
      uncertainties,
    };
  }

  // RSS 2.0
  if (doc?.rss?.channel) {
    const channel = doc.rss.channel;
    const items = asArray(channel.item).map((it, idx) => normalizeItem(it, 'rss', idx, uncertainties, label));
    return { ok: true, label, kind: 'rss', title: textOf(channel.title), items, uncertainties };
  }
  // Atom
  if (doc?.feed) {
    const feed = doc.feed;
    const items = asArray(feed.entry).map((it, idx) => normalizeItem(it, 'atom', idx, uncertainties, label));
    return { ok: true, label, kind: 'atom', title: textOf(feed.title), items, uncertainties };
  }
  uncertainties.push(uncertainty('unknown-feed-kind', 'Not recognized as RSS channel or Atom feed'));
  return { ok: true, label, kind: 'unknown', items: [], uncertainties };
}

function normalizeItem(it, kind, idx, uncertainties, label = 'feed') {
  if (!it || typeof it !== 'object') {
    uncertainties.push(uncertainty('malformed-item', `item ${idx} not object`, { index: idx }));
    return { index: idx, id: null, guid: null, link: null, title: null, updated: null, fingerprint: `malformed:${idx}` };
  }
  let id = null;
  let guid = null;
  let link = null;
  let title = null;
  let updated = null;
  if (kind === 'rss') {
    title = textOf(it.title);
    link = textOf(it.link);
    guid = textOf(it.guid);
    id = guid || link || null;
    updated = textOf(it.pubDate) || textOf(it['dc:date']) || null;
  } else {
    title = textOf(it.title);
    id = textOf(it.id);
    updated = textOf(it.updated) || textOf(it.published) || null;
    const links = asArray(it.link);
    const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') || links[0];
    link = textOf(alt) || (alt && alt['@_href']) || null;
    guid = id;
  }
  if (!id && !link && !title) {
    // Empty-string title (e.g. <title></title>) is not an identity.
    uncertainties.push(
      uncertainty(
        'item-unidentifiable',
        `${label} item ${idx} is unidentifiable: guid/id, link, and title are all absent or empty; empty title is not an identity, so matching across feeds is unreliable`,
        { index: idx, feed: label, kind, id, guid, link, title },
      ),
    );
  } else if (!id && !guid) {
    uncertainties.push(
      uncertainty(
        'missing-item-id',
        `${label} item ${idx} lacks guid/id; identity falls back to link/title and may collide`,
        { index: idx, feed: label, kind, link, title },
      ),
    );
  }
  const dateInfo = classifyDate(updated);
  if (dateInfo.ambiguous) {
    uncertainties.push(
      uncertainty('date-ambiguity', `${label} item ${idx} has ambiguous/unparseable date`, {
        index: idx,
        feed: label,
        raw: updated,
        reason: dateInfo.reason,
      }),
    );
  }
  const fingerprint = [id || '', link || '', title || ''].join('\u001f');
  return {
    index: idx,
    id,
    guid,
    link,
    title,
    updated,
    dateInfo,
    fingerprint,
    raw: { title, link, id, guid, updated },
  };
}

function classifyDate(raw) {
  if (raw == null || String(raw).trim() === '') {
    return { ambiguous: false, reason: 'absent', parsed: null };
  }
  const s = String(raw).trim();
  // Relative / non-calendar tokens
  if (/^(yesterday|today|tomorrow|now|recently)$/i.test(s)) {
    return { ambiguous: true, reason: 'relative-token', parsed: null };
  }
  // Bare slash dates like 02/01/2024 are locale-ambiguous (MDY vs DMY)
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    return { ambiguous: true, reason: 'slash-date-locale-ambiguous', parsed: null };
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) {
    return { ambiguous: true, reason: 'unparseable', parsed: null };
  }
  return { ambiguous: false, reason: 'parsed', parsed: new Date(t).toISOString() };
}

function dedupKey(item) {
  return item.id || item.guid || item.link || `title:${item.title || ''}` || `idx:${item.index}`;
}

export function compareFeeds(beforeXml, afterXml) {
  const before = parseFeed(beforeXml, 'before');
  const after = parseFeed(afterXml, 'after');
  const uncertainties = [...before.uncertainties, ...after.uncertainties];

  if (!before.ok || !after.ok) {
    return {
      module: 'rss-atom-brief',
      ok: false,
      errors: [before.ok ? null : before, after.ok ? null : after].filter(Boolean),
      uncertainties,
      freeBaseline: FREE_BASELINE,
      differenceInDeliveredOutput: 'No feed brief: XML parse failed.',
    };
  }

  if (before.kind !== after.kind && before.kind !== 'empty' && after.kind !== 'empty' && before.kind !== 'unknown' && after.kind !== 'unknown') {
    uncertainties.push(
      uncertainty('kind-mismatch', `before kind=${before.kind} after kind=${after.kind}; identity mapping may be weak`),
    );
  }

  const bMap = new Map();
  const aMap = new Map();
  const bDup = [];
  const aDup = [];
  for (const it of before.items) {
    const k = dedupKey(it);
    if (bMap.has(k)) bDup.push(k);
    bMap.set(k, it);
  }
  for (const it of after.items) {
    const k = dedupKey(it);
    if (aMap.has(k)) aDup.push(k);
    aMap.set(k, it);
  }
  if (bDup.length) {
    uncertainties.push(uncertainty('duplicates-before', 'Duplicate identity keys in before', { count: bDup.length, keys: bDup.slice(0, 10) }));
  }
  if (aDup.length) {
    uncertainties.push(uncertainty('duplicates-after', 'Duplicate identity keys in after', { count: aDup.length, keys: aDup.slice(0, 10) }));
  }

  const added = [];
  const removed = [];
  const corrected = [];
  const unchanged = [];
  const conflicting = [];

  for (const [k, it] of aMap) {
    if (!bMap.has(k)) added.push({ key: k, item: summarize(it) });
    else {
      const prev = bMap.get(k);
      const changes = [];
      if ((prev.title || null) !== (it.title || null)) changes.push({ field: 'title', before: prev.title, after: it.title });
      if ((prev.link || null) !== (it.link || null)) changes.push({ field: 'link', before: prev.link, after: it.link });
      if ((prev.updated || null) !== (it.updated || null)) {
        const beforeAmb = prev.dateInfo?.ambiguous || classifyDate(prev.updated).ambiguous;
        const afterAmb = it.dateInfo?.ambiguous || classifyDate(it.updated).ambiguous;
        if (beforeAmb || afterAmb) {
          changes.push({
            field: 'updated',
            before: prev.updated,
            after: it.updated,
            ambiguity: true,
            note: 'date token(s) ambiguous or unparseable; correction recorded without asserting chronological order',
          });
          uncertainties.push(
            uncertainty('date-ambiguity-correction', `item ${k} updated field changed with ambiguous date(s)`, {
              key: k,
              before: prev.updated,
              after: it.updated,
            }),
          );
        } else {
          changes.push({ field: 'updated', before: prev.updated, after: it.updated });
        }
      }
      if ((prev.id || null) !== (it.id || null) && (prev.guid || null) !== (it.guid || null)) {
        // same dedup key but id/guid representation shifted
        conflicting.push({ key: k, note: 'identity fields disagree under shared dedup key', before: summarize(prev), after: summarize(it) });
      }
      if (changes.length) corrected.push({ key: k, changes });
      else unchanged.push({ key: k });
    }
  }
  for (const [k, it] of bMap) {
    if (!aMap.has(k)) removed.push({ key: k, item: summarize(it) });
  }

  // Dedup change brief: how many unique keys vs raw item counts
  const dedupBrief = {
    beforeRawCount: before.items.length,
    afterRawCount: after.items.length,
    beforeUniqueKeys: bMap.size,
    afterUniqueKeys: aMap.size,
    beforeDuplicateKeys: bDup.length,
    afterDuplicateKeys: aDup.length,
    uniqueCountDelta: aMap.size - bMap.size,
  };

  const hasSignal =
    added.length + removed.length + corrected.length + conflicting.length > 0 ||
    dedupBrief.beforeDuplicateKeys !== dedupBrief.afterDuplicateKeys ||
    dedupBrief.uniqueCountDelta !== 0;

  return {
    module: 'rss-atom-brief',
    ok: true,
    beforeKind: before.kind,
    afterKind: after.kind,
    added: stableSort(added, (x) => x.key).slice(0, 100),
    removed: stableSort(removed, (x) => x.key).slice(0, 100),
    corrected: stableSort(corrected, (x) => x.key).slice(0, 100),
    conflicting: stableSort(conflicting, (x) => x.key).slice(0, 50),
    unchangedCount: unchanged.length,
    dedupBrief,
    truncated: added.length > 100 || removed.length > 100 || corrected.length > 100,
    uncertainties,
    freeBaseline: FREE_BASELINE,
    differenceInDeliveredOutput: hasSignal
      ? 'Briefs item add/remove/title-link-updated corrections and dedup-key counts over supplied XML. Does not poll feeds, push alerts, or assert content authenticity.'
      : 'No correction/dedup signal (or empty feeds). Still not a monitoring product.',
  };
}

function summarize(it) {
  return { id: it.id, guid: it.guid, link: it.link, title: it.title, updated: it.updated };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`Usage: s134-rss-atom-brief --before <xml> --after <xml>\n`);
    process.exit(0);
  }
  if (!args.before || !args.after) {
    process.stderr.write('missing --before/--after\n');
    process.exit(2);
  }
  const beforeXml = fs.readFileSync(args.before, 'utf8');
  const afterXml = fs.readFileSync(args.after, 'utf8');
  const report = compareFeeds(beforeXml, afterXml);
  emit({
    tool: 's134-rss-atom-brief',
    inputs: { before: path.resolve(args.before), after: path.resolve(args.after) },
    report,
  });
  process.exit(report.ok ? 0 : 2);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

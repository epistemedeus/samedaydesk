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
  let description = null;
  let content = null;
  if (kind === 'rss') {
    title = textOf(it.title);
    link = textOf(it.link);
    guid = textOf(it.guid);
    id = guid || link || null;
    updated = textOf(it.pubDate) || textOf(it['dc:date']) || null;
    description = textOf(it.description);
    content = textOf(it['content:encoded']) || textOf(it.content) || null;
  } else {
    title = textOf(it.title);
    id = textOf(it.id);
    updated = textOf(it.updated) || textOf(it.published) || null;
    const links = asArray(it.link);
    const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') || links[0];
    link = textOf(alt) || (alt && alt['@_href']) || null;
    guid = id;
    // Atom body: content / summary (bounded text only; no HTML interpretation engine)
    content = textOf(it.content);
    description = textOf(it.summary);
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
    description,
    content,
    dateInfo,
    fingerprint,
    raw: { title, link, id, guid, updated, description, content },
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

  const comparableKinds = new Set(['rss', 'atom']);
  const beforeComparable = comparableKinds.has(before.kind);
  const afterComparable = comparableKinds.has(after.kind);
  // F6: empty/non-feed inputs are not empty snapshots for definitive removals.
  if (!beforeComparable || !afterComparable) {
    uncertainties.push(
      uncertainty(
        'incomparable-feed-snapshot',
        `Comparison gated: before kind=${before.kind}, after kind=${after.kind}. Empty or non-feed input is not treated as a zero-item feed.`,
        { beforeKind: before.kind, afterKind: after.kind },
      ),
    );
    return {
      module: 'rss-atom-brief',
      ok: true,
      comparable: false,
      comparisonStatus: 'indeterminate',
      beforeKind: before.kind,
      afterKind: after.kind,
      added: [],
      removed: [],
      corrected: [],
      conflicting: [],
      unchangedCount: 0,
      metadataUnchangedCount: 0,
      coverage: {
        comparedFields: [],
        note: 'No definitive add/remove/correct counts because one or both inputs are not recognizable feed snapshots.',
      },
      dedupBrief: {
        beforeRawCount: before.items.length,
        afterRawCount: after.items.length,
        beforeUniqueKeys: 0,
        afterUniqueKeys: 0,
        beforeDuplicateKeys: 0,
        afterDuplicateKeys: 0,
        uniqueCountDelta: 0,
      },
      truncated: false,
      uncertainties,
      freeBaseline: FREE_BASELINE,
      differenceInDeliveredOutput:
        'Indeterminate feed comparison: unavailable/empty/non-feed input does not authorize definitive removals or unchanged counts.',
    };
  }

  // Group by identity key; do not last-write-wins (F4).
  function groupByKey(items) {
    const map = new Map();
    for (const it of items) {
      const k = dedupKey(it);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return map;
  }
  const bGroups = groupByKey(before.items);
  const aGroups = groupByKey(after.items);
  const bDup = [...bGroups.entries()].filter(([, list]) => list.length > 1).map(([k]) => k);
  const aDup = [...aGroups.entries()].filter(([, list]) => list.length > 1).map(([k]) => k);
  if (bDup.length) {
    uncertainties.push(uncertainty('duplicates-before', 'Duplicate identity keys in before; differing candidates stay ambiguous', { count: bDup.length, keys: bDup.slice(0, 10) }));
  }
  if (aDup.length) {
    uncertainties.push(uncertainty('duplicates-after', 'Duplicate identity keys in after; differing candidates stay ambiguous', { count: aDup.length, keys: aDup.slice(0, 10) }));
  }

  const added = [];
  const removed = [];
  const corrected = [];
  const unchanged = [];
  const conflicting = [];
  const comparedFields = ['title', 'link', 'updated', 'description', 'content'];

  function itemSig(it) {
    return JSON.stringify({
      title: it.title || null,
      link: it.link || null,
      updated: it.updated || null,
      description: it.description || null,
      content: it.content || null,
      id: it.id || null,
      guid: it.guid || null,
    });
  }

  function collapseExact(list) {
    const uniq = [];
    const seen = new Set();
    for (const it of list) {
      const s = itemSig(it);
      if (!seen.has(s)) {
        seen.add(s);
        uniq.push(it);
      }
    }
    return uniq;
  }

  const allKeys = new Set([...bGroups.keys(), ...aGroups.keys()]);
  for (const k of [...allKeys].sort()) {
    const bList = collapseExact(bGroups.get(k) || []);
    const aList = collapseExact(aGroups.get(k) || []);
    if (bList.length === 0 && aList.length === 1) {
      added.push({ key: k, item: summarize(aList[0]) });
      continue;
    }
    if (bList.length === 1 && aList.length === 0) {
      removed.push({ key: k, item: summarize(bList[0]) });
      continue;
    }
    if (bList.length === 0 && aList.length === 0) continue;
    if (bList.length > 1 || aList.length > 1) {
      conflicting.push({
        key: k,
        reason: 'duplicate-identity-ambiguous',
        beforeCandidates: bList.map(summarize),
        afterCandidates: aList.map(summarize),
        note: 'Multiple distinct records share this identity key; refusing definitive changed/unchanged.',
      });
      continue;
    }
    const prev = bList[0];
    const it = aList[0];
    const changes = [];
    if ((prev.title || null) !== (it.title || null)) changes.push({ field: 'title', before: prev.title, after: it.title });
    if ((prev.link || null) !== (it.link || null)) changes.push({ field: 'link', before: prev.link, after: it.link });
    if ((prev.description || null) !== (it.description || null)) {
      changes.push({ field: 'description', before: prev.description, after: it.description });
    }
    if ((prev.content || null) !== (it.content || null)) {
      changes.push({ field: 'content', before: prev.content, after: it.content });
    }
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
      conflicting.push({
        key: k,
        note: 'identity fields disagree under shared dedup key',
        before: summarize(prev),
        after: summarize(it),
      });
    }
    // Title-only identity is weak: do not treat as strong unique identity when both lack id/guid/link
    const weakIdentity = !prev.id && !prev.guid && !prev.link && !it.id && !it.guid && !it.link;
    if (weakIdentity && changes.length === 0) {
      uncertainties.push(
        uncertainty('weak-title-only-identity', `item ${k} matched on title only; identity not unique`, { key: k }),
      );
    }
    if (changes.length) corrected.push({ key: k, changes });
    else unchanged.push({ key: k });
  }

  const dedupBrief = {
    beforeRawCount: before.items.length,
    afterRawCount: after.items.length,
    beforeUniqueKeys: bGroups.size,
    afterUniqueKeys: aGroups.size,
    beforeDuplicateKeys: bDup.length,
    afterDuplicateKeys: aDup.length,
    uniqueCountDelta: aGroups.size - bGroups.size,
  };

  const hasSignal =
    added.length + removed.length + corrected.length + conflicting.length > 0 ||
    dedupBrief.beforeDuplicateKeys !== dedupBrief.afterDuplicateKeys ||
    dedupBrief.uniqueCountDelta !== 0;

  return {
    module: 'rss-atom-brief',
    ok: true,
    comparable: true,
    comparisonStatus: 'comparable',
    beforeKind: before.kind,
    afterKind: after.kind,
    added: stableSort(added, (x) => x.key).slice(0, 100),
    removed: stableSort(removed, (x) => x.key).slice(0, 100),
    corrected: stableSort(corrected, (x) => x.key).slice(0, 100),
    conflicting: stableSort(conflicting, (x) => x.key).slice(0, 50),
    unchangedCount: unchanged.length,
    metadataUnchangedCount: unchanged.length,
    coverage: {
      comparedFields,
      note: 'Compares title/link/updated plus bounded description/content text when present. Not a full RSS/Atom standards engine.',
    },
    dedupBrief,
    truncated: added.length > 100 || removed.length > 100 || corrected.length > 100,
    uncertainties,
    freeBaseline: FREE_BASELINE,
    differenceInDeliveredOutput: hasSignal
      ? 'Briefs item add/remove/title-link-updated-description/content corrections and dedup-key counts over supplied XML. Does not poll feeds, push alerts, or assert content authenticity.'
      : 'No correction/dedup signal on comparable feed snapshots. Still not a monitoring product.',
  };
}

function summarize(it) {
  return {
    id: it.id,
    guid: it.guid,
    link: it.link,
    title: it.title,
    updated: it.updated,
    description: it.description ?? null,
    content: it.content ?? null,
  };
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

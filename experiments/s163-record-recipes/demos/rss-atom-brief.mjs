#!/usr/bin/env node
import path from 'node:path';
import { ROOT, s134Module, runNode, parseCliJson } from './lib.mjs';
import { prepareFeedCapture, buildFeedCliArgs } from '../adapters/rss-atom.mjs';

const liveBefore = path.join(ROOT, 'sources/feeds/electron-releases/capture-a.xml');
const liveAfter = path.join(ROOT, 'sources/feeds/electron-releases/capture-b.xml');
const synBefore = path.join(ROOT, 'sources/feeds/nodejs-releases/synthetic-correction-dedup-before.xml');
const synAfter = path.join(ROOT, 'sources/feeds/nodejs-releases/synthetic-correction-dedup-after.xml');

const livePrep = buildFeedCliArgs({
  before: liveBefore,
  after: liveAfter,
  s134Root: path.join(ROOT, '../s134-record-jobs'),
  allowSynthetic: false,
});
if (!livePrep.ok) {
  console.error(livePrep);
  process.exit(2);
}

const live = runNode(s134Module('rss-atom-brief'), ['--before', liveBefore, '--after', liveAfter]);
const syn = runNode(s134Module('rss-atom-brief'), ['--before', synBefore, '--after', synAfter]);
if (live.status !== 0 || syn.status !== 0) {
  console.error(live.stderr || syn.stderr);
  process.exit(1);
}
const liveReport = parseCliJson(live.stdout).report;
const synReport = parseCliJson(syn.stdout).report;
const synMeta = prepareFeedCapture(synAfter);
console.log(
  JSON.stringify(
    {
      demo: 'rss-atom-brief',
      live: {
        comparisonStatus: liveReport.comparisonStatus,
        corrected: (liveReport.corrected || []).length,
        unchangedCount: liveReport.unchangedCount,
        synthetic: false,
      },
      syntheticCorrectionDedup: {
        comparisonStatus: synReport.comparisonStatus,
        corrected: (synReport.corrected || []).length,
        synthetic: synMeta.synthetic,
        label: 'SYNTHETIC — not a live-feed observation',
      },
    },
    null,
    2,
  ),
);

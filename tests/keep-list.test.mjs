// Guard rails for the live design (design/BASELINE.md) and the selling rules
// (design/SELLING-RULES.md).
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

const src = (p) => readFileSync(join('client/src', p), 'utf8');

test('the reticle is on the hero', () => {
  assert.match(src('components/Hero.tsx'), /<EnergySurface\s*\/>/);
  assert.match(src('components/EnergySurface.module.css'), /mask:\s*var\(--reg-target\)/);
  assert.match(src('styles/tokens.css'), /--reg-target: url\("data:image\/svg\+xml,[^"]*circle/);
});

test('the drafting frame and its grid are on every page', () => {
  assert.match(src('App.tsx'), /<DraftingFrame\s*\/>/);
  assert.match(src('components/DraftingFrame.tsx'), /styles\.tl[\s\S]*styles\.br/);
  assert.match(src('styles/drafting.css'), /hairline grid/);
});

test('the motion system and the two themes stay', () => {
  assert.match(src('lib/theme.tsx'), /"dark" \| "drafting"/);
  assert.match(src('motion/useSmoothScroll.ts'), /lenis/i);
});

test('a page with a blocked finding fails the copy check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'copy-'));
  writeFileSync(join(dir, 'index.html'), '<p>x</p>');
  writeFileSync(join(dir, 'bad.html'), '<p>Legal copy coming soon. Pilot public lab.</p>');
  const r = spawnSync(process.execPath, ['tools/public-copy-check.mjs', '--site', 'samedaydesk', join(dir, 'bad.html')]);
  assert.equal(r.status, 1);
});

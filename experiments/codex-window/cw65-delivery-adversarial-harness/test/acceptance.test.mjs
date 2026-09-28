import { test } from 'node:test';
import { Context } from '../lib/context.mjs';
import { cases as lifecycle } from '../../../wave5/d16/current.mjs';
import { cases as contamination } from '../../../wave5/d18/current.mjs';
import { cases as orders } from '../../../wave5/d19/current.mjs';
import { cases as interruption } from '../../../wave5/d20/current.mjs';

const cases = [...lifecycle, ...contamination, ...orders, ...interruption];
if (process.env.CW65_ONLY && !cases.some(([id]) => id === process.env.CW65_ONLY)) throw new Error('Unknown CW65_ONLY case');
for (const [id, run] of cases.filter(([id]) => !process.env.CW65_ONLY || process.env.CW65_ONLY === id)) {
  test(id, { timeout: 55_000 }, async () => {
    const ctx = new Context(id); const startedAt = new Date().toISOString();
    let failure = null;
    try { await run(ctx); } catch (error) { failure = error; }
    try { await ctx.cleanup(); } catch (error) { failure ||= error; }
    ctx.json('verdict', { id, startedAt, endedAt: new Date().toISOString(),
      status: failure ? failure.code === 'CURRENT_SURFACE_MISSING' ? 'incomplete' : 'fail' : 'pass',
      error: failure ? { message: failure.message, code: failure.code || null, stack: failure.stack } : null });
    if (failure) throw failure;
  });
}

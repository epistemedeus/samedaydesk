import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('actual SIGKILL after successful engine and before store.complete does not rerun', async (t) => {
  const kit = process.env.H21_EXTRACTED_KIT;
  assert.ok(kit, 'Run through replay-repaired.py to test extracted candidate bytes');
  const work = mkdtempSync(join(tmpdir(), 'h21-kill-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const orders = join(kit, 'tools/managed-useful-jobs-order/fixtures/orders');
  const orderUrl = pathToFileURL(join(kit, 'tools/managed-useful-jobs-order/lib/create-order.mjs')).href;
  const storeUrl = pathToFileURL(join(kit, 'tools/managed-useful-jobs-order/lib/store-file.mjs')).href;
  const storeDir = join(work, 'store');
  const marker = join(work, 'successful-before-complete.json');
  const raw = JSON.parse(readFileSync(join(orders, 'ord-1.json'), 'utf8'));
  const options = { requestDir: orders, outDir: join(work, 'out'), wrapperRoot: join(kit, 'server/paid-useful-jobs') };
  const script = `
    import assert from 'node:assert/strict';
    import {writeFileSync} from 'node:fs';
    import {runCreateOrder} from ${JSON.stringify(orderUrl)};
    import {createFileStore} from ${JSON.stringify(storeUrl)};
    const store = createFileStore(${JSON.stringify(storeDir)});
    store.complete = async (orderId, result) => {
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.wrapper.delivery.complete, true);
      assert.equal(result.sold, false);
      assert.equal(result.purchaseAuthority, false);
      writeFileSync(${JSON.stringify(marker)}, JSON.stringify(result));
      process.kill(process.pid, 'SIGKILL');
      await new Promise(() => {});
    };
    await runCreateOrder(${JSON.stringify(raw)}, {...${JSON.stringify(options)}, store});
  `;
  const killed = spawnSync(process.execPath, ['--input-type=module', '-e', script],
    { cwd: kit, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(killed.signal, 'SIGKILL', killed.stdout + killed.stderr);
  const completed = JSON.parse(readFileSync(marker, 'utf8'));
  const journalPath = join(storeDir, 'executions.jsonl');
  const before = readFileSync(journalPath, 'utf8');
  assert.equal(before.trim().split('\n').length, 1);
  const { runCreateOrder } = await import(orderUrl);
  const { createFileStore } = await import(storeUrl);
  const reopened = await runCreateOrder(raw, { ...options, outDir: join(work, 'reopen'), store: createFileStore(storeDir) });
  assert.equal(readFileSync(journalPath, 'utf8'), before);
  assert.equal(reopened.ok, false);
  assert.equal(reopened.code, 'interrupted-incomplete');
  assert.equal(reopened.sold, false);
  assert.equal(reopened.purchaseAuthority, false);
  t.diagnostic(JSON.stringify({ successfulEngineExecutionId: completed.wrapper.executionId,
    signal: killed.signal, executionCountBefore: 1, executionCountAfter: 1, reopenedCode: reopened.code }));
});

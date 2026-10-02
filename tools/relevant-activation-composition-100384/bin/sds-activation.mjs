#!/usr/bin/env node
/** SPDX-License-Identifier: MIT */
import { compose } from '../src/composition.mjs';
import { bounded } from '../src/input.mjs';
import { fail, scopeFor } from '../src/budget.mjs';
import { publicError } from '../src/errors.mjs';

const command = process.argv[2] ?? 'help';
if (command === 'help' && process.argv.length <= 3) {
  process.stdout.write('sds-activation plan|handoff|return|cancel < private-input.json\nConfiguration and grants are environment-only. README.md documents the exact facts and scope.\n');
} else {
  try {
    if (process.argv.length !== 3 || !['plan', 'handoff', 'return', 'cancel'].includes(command) || process.stdin.isTTY) throw fail('invalid_input');
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    const scope = scopeFor(process.env, { signal: controller.signal, stdin: process.stdin });
    const input = await scope.run(async () => {
      let body = '';
      let bytes = 0;
      for await (const chunk of process.stdin) {
        bytes += chunk.length;
        if (bytes > 32768) { process.stdin.destroy(); throw fail('input_limit'); }
        body += chunk;
      }
      const input = JSON.parse(body);
      bounded(input);
      return input;
    });
    const output = await compose(command, input, { scope });
    const text = JSON.stringify(output);
    if (Buffer.byteLength(text) > 65536) throw fail('output_limit');
    process.stdout.write(text + '\n');
  } catch (error) {
    // Never print exception messages, server bodies, credentials or raw input.
    process.stdout.write(JSON.stringify({ ok: false, productionMutation: false, error: publicError(error) }) + '\n');
    process.exitCode = 2;
  }
}

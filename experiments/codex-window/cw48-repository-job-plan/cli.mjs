#!/usr/bin/env node
import { readFileSync, lstatSync } from 'node:fs';
import { createPlan, verifyPlan, assertNoSymlinks } from './lib/planner.mjs';
import { refuse } from './lib/git.mjs';

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || command === 'help') {
    console.log('node --max-old-space-size=768 cli.mjs plan --repo REPO --base COMMIT --head COMMIT --policy POLICY.json --out NEW_DIRECTORY\nnode cli.mjs verify --out DIRECTORY --sha256 PLAN_SHA256\nDry-run only. JSON stdout. No network, signing, payment, or engine execution. Exit 0 ready/no_git_changes, 2 stops/refusal.');
  } else {
    const allowed = command === 'plan' ? ['repo', 'base', 'head', 'policy', 'out'] : command === 'verify' ? ['out', 'sha256'] : [];
    const flags = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2);
      if (!args[i].startsWith('--') || !allowed.includes(key) || Object.hasOwn(flags, key) || !args[i + 1]) refuse('usage');
      flags[key] = args[i + 1];
    }
    if (!allowed.length || allowed.some(key => !flags[key])) refuse('usage');
    let result;
    if (command === 'verify') result = verifyPlan(flags.out, flags.sha256);
    else {
      const file = assertNoSymlinks(flags.policy), stat = lstatSync(file);
      if (!stat.isFile() || stat.size > 65536) refuse('policy_byte_limit');
      const policy = JSON.parse(readFileSync(file));
      result = await createPlan({ ...flags, policy });
      if (result.stops.length) process.exitCode = 2;
    }
    console.log(JSON.stringify(result, null, 2));
  }
} catch (err) {
  console.log(JSON.stringify({ schema: 'samedaydesk.repository-job-plan-error.v1', ok: false, code: err.code || 'planner_failed', executionAuthorized: false }));
  process.exitCode = 2;
}

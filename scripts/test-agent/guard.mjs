#!/usr/bin/env node
// Policy gate for the agent's output. Inspects uncommitted changes in the working tree
// (relative to HEAD) and fails if anything outside the allowed test paths was touched,
// a test was deleted, or a test contains suite-weakening patterns.
// Usage: node scripts/test-agent/guard.mjs [--out .test-agent/guard.json]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { FORBIDDEN_IN_TESTS, isAgentWritable } from './rules.mjs';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: '.test-agent/guard.json' } } });

const raw = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'], { encoding: 'utf8' });
const changed = raw.split('\0').filter(Boolean).map((e) => ({ status: e.slice(0, 2).trim(), path: e.slice(3) }))
  .filter((c) => !c.path.startsWith('.test-agent/'));

const violations = [];
for (const c of changed) {
  if (!isAgentWritable(c.path)) violations.push({ path: c.path, rule: 'path not writable by the agent' });
  else if (c.status.includes('D')) violations.push({ path: c.path, rule: 'test files may not be deleted' });
  else {
    const text = readFileSync(c.path, 'utf8');
    for (const { re, why } of FORBIDDEN_IN_TESTS) if (re.test(text)) violations.push({ path: c.path, rule: why });
    if (Buffer.byteLength(text) > 200_000) violations.push({ path: c.path, rule: 'file too large' });
  }
}

const result = { ok: violations.length === 0, changed, violations };
writeFileSync(args.out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

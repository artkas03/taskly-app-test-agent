#!/usr/bin/env node
// First pipeline step: turns a git range into the change plan the agent works from.
// Usage: node scripts/test-agent/detect-changes.mjs --base <sha> --head <sha> [--out .test-agent]
//        node scripts/test-agent/detect-changes.mjs --sweep [--out .test-agent]
// Writes plan.json + changes.diff, and should_run/frontend/backend to $GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { classify, testPathFor } from './rules.mjs';

const { values: args } = parseArgs({
  options: { base: { type: 'string' }, head: { type: 'string' }, out: { type: 'string', default: '.test-agent' }, sweep: { type: 'boolean', default: false } },
});
const SHA = /^[0-9a-f]{7,40}$/;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const packages = { frontend: { sources: [], changedTests: [] }, backend: { sources: [], changedTests: [] } };
const skipped = [];
let diff = '';

if (args.sweep) {
  for (const p of git('ls-files', 'frontend/src', 'backend/src').split('\n').filter(Boolean)) {
    const c = classify(p);
    if (!c.pkg) continue;
    const test = testPathFor(p);
    if (!existsSync(test)) packages[c.pkg].sources.push({ path: p, status: 'A', existingTest: null, linesAdded: 0, linesRemoved: 0 });
  }
} else {
  if (!SHA.test(args.base ?? '') || !SHA.test(args.head ?? '')) throw new Error('--base and --head must be commit SHAs');
  const range = `${args.base}...${args.head}`;
  const numstat = new Map(
    git('diff', '--numstat', '--no-renames', range).split('\n').filter(Boolean).map((l) => {
      const [a, r, p] = l.split('\t');
      return [p, { linesAdded: Number(a) || 0, linesRemoved: Number(r) || 0 }];
    }),
  );
  const inScope = [];
  for (const line of git('diff', '--name-status', '--no-renames', range).split('\n').filter(Boolean)) {
    const [status, p] = line.split('\t');
    const c = classify(p);
    if (c.test) { packages[c.test].changedTests.push(p); continue; }
    if (c.skip) { skipped.push({ path: p, reason: c.skip }); continue; }
    if (status === 'D') {
      skipped.push({ path: p, reason: 'source deleted' });
      continue;
    }
    const test = testPathFor(p);
    packages[c.pkg].sources.push({ path: p, status, existingTest: existsSync(test) ? test : null, ...numstat.get(p) });
    inScope.push(p);
  }
  if (inScope.length) diff = git('diff', '--unified=5', range, '--', ...inScope);
}

// Cap the number of files per run to bound agent cost; the rest is reported as skipped.
const MAX_FILES = Number(process.env.TEST_AGENT_MAX_FILES || 15);
for (const pkg of Object.values(packages)) {
  pkg.sources.sort((a, b) => (b.linesAdded ?? 0) - (a.linesAdded ?? 0));
}
let budget = MAX_FILES;
for (const pkg of Object.values(packages)) {
  const kept = pkg.sources.slice(0, Math.max(budget, 0));
  for (const s of pkg.sources.slice(kept.length)) skipped.push({ path: s.path, reason: `over file limit (${MAX_FILES})` });
  pkg.sources = kept;
  budget -= kept.length;
}

const plan = { mode: args.sweep ? 'sweep' : 'pr', base: args.base ?? null, head: args.head ?? null, packages, skipped };
mkdirSync(args.out, { recursive: true });
writeFileSync(`${args.out}/plan.json`, JSON.stringify(plan, null, 2) + '\n');
writeFileSync(`${args.out}/changes.diff`, diff);

const frontend = packages.frontend.sources.length > 0;
const backend = packages.backend.sources.length > 0;
const outputs = { should_run: frontend || backend, frontend, backend, files: packages.frontend.sources.length + packages.backend.sources.length };
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}
console.log(JSON.stringify({ ...outputs, skipped: skipped.length }, null, 2));

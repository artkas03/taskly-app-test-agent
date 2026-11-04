#!/usr/bin/env node
// Checks the agent's result in a job that has no LLM credential.
//   --phase before : coverage of the PR as it is, before the agent's tests are applied
//   --phase after  : typecheck, full test suite and coverage with the agent's tests applied, then
//                    the new or changed test files run TEST_AGENT_REPEAT_RUNS more times (default 5).
//                    A test that fails in any repetition counts as flaky, as in Meta's TestGen-LLM.
// Writes .test-agent/verify.json and exits with 1 if any package fails in the "after" phase.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: { phase: { type: 'string' }, dir: { type: 'string', default: '.test-agent' }, packages: { type: 'string', default: 'frontend,backend' } },
});
if (!['before', 'after'].includes(args.phase)) throw new Error('--phase before|after');
const packages = args.packages.split(',').filter((p) => ['frontend', 'backend'].includes(p));
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const plan = readJson(`${args.dir}/plan.json`);
const guard = readJson(`${args.dir}/guard.json`);
const REPEAT_RUNS = Math.max(0, Number(process.env.TEST_AGENT_REPEAT_RUNS ?? 5));

function run(cwd, cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, CI: 'true', NO_COLOR: '1' }, timeout: 15 * 60_000 });
  process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
  return r.status === 0;
}

function coverage(pkg) {
  const summaryPath = `${pkg}/coverage/coverage-summary.json`;
  if (!existsSync(summaryPath)) return null;
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const files = {};
  for (const [abs, m] of Object.entries(summary)) {
    if (abs === 'total') continue;
    const rel = abs.replace(/\\/g, '/').split(`/${pkg}/`).pop();
    files[`${pkg}/${rel}`] = { lines: m.lines.pct, branches: m.branches.pct, functions: m.functions.pct };
  }
  return { lines: summary.total.lines.pct, branches: summary.total.branches.pct, functions: summary.total.functions.pct, statements: summary.total.statements.pct, files };
}

function testsAndCoverage(pkg) {
  rmSync(`${pkg}/coverage`, { recursive: true, force: true });
  const resultFile = `../${args.dir}/vitest-${pkg}-${args.phase}.json`;
  const ok = run(pkg, './node_modules/.bin/vitest', ['run', '--coverage', '--coverage.reporter=json-summary', '--coverage.reporter=text-summary', '--reporter=default', '--reporter=json', `--outputFile.json=${resultFile}`]);
  let passed, failed;
  try {
    const r = JSON.parse(readFileSync(`${args.dir}/vitest-${pkg}-${args.phase}.json`, 'utf8'));
    passed = r.numPassedTests; failed = r.numFailedTests + (r.numFailedTestSuites ?? 0);
  } catch { /* reporter output missing: keep undefined */ }
  return { ok, passed, failed, coverage: coverage(pkg) };
}

const statePath = `${args.dir}/verify.json`;
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { packages: {} };

for (const pkg of packages) {
  const entry = (state.packages[pkg] ??= {});
  const result = testsAndCoverage(pkg);
  if (args.phase === 'before') {
    entry.before = { ok: result.ok, passed: result.passed, failed: result.failed };
    entry.coverage = { before: result.coverage };
    continue;
  }
  entry.typecheck = run(pkg, 'npm', ['run', '--silent', 'typecheck']);
  entry.tests = { ok: result.ok, passed: result.passed, failed: result.failed };
  const testFiles = (guard?.changed ?? [])
    .map((c) => c.path)
    .filter((p) => p.startsWith(`${pkg}/`) && /\.test\.tsx?$/.test(p) && existsSync(p))
    .map((p) => p.slice(pkg.length + 1));
  let failedRuns = 0;
  if (testFiles.length) {
    for (let i = 0; i < REPEAT_RUNS; i++) if (!run(pkg, './node_modules/.bin/vitest', ['run', '--reporter=dot', ...testFiles])) failedRuns++;
  }
  entry.stability = { files: testFiles.length, runs: testFiles.length ? REPEAT_RUNS : 0, failedRuns };
  entry.coverage = { ...(entry.coverage ?? {}), after: result.coverage };
  const changed = (plan?.packages?.[pkg]?.sources ?? []).map((s) => s.path);
  entry.changedFiles = changed.map((p) => {
    const before = entry.coverage.before?.files?.[p] ?? null;
    const after = entry.coverage.after?.files?.[p] ?? null;
    // A file counts as improved when its line coverage went up or is already complete.
    const improved = after !== null && (after.lines === 100 || after.lines > (before?.lines ?? 0));
    return { path: p, before, after, improved };
  });
  // Keep the artefact small: per-file maps are only needed for changedFiles.
  for (const phase of ['before', 'after']) if (entry.coverage[phase]) delete entry.coverage[phase].files;
}

if (args.phase === 'after') {
  state.ok = packages.every((p) => {
    const e = state.packages[p];
    return e.typecheck && e.tests.ok && e.stability.failedRuns === 0;
  });
}
writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
if (args.phase === 'after' && !state.ok) process.exit(1);

#!/usr/bin/env node
// Renders the PR comment from pipeline artefacts. It only reads JSON files and never
// runs PR code. Missing artefacts are rendered as "not available".
// Usage: node scripts/test-agent/render-comment.mjs --dir <artefacts dir> --run-url <url> > comment.md
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { validateReport } from './schema.mjs';

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string', default: '.test-agent' },
    'run-url': { type: 'string', default: '' },
    committed: { type: 'string', default: '' },
  },
});
export const MARKER = '<!-- test-agent-report -->';

const read = (name) => {
  const p = `${args.dir}/${name}`;
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
};
// Agent text is untrusted: strip HTML and Markdown control characters so it cannot fake
// parts of the comment or mention people.
const esc = (s) => String(s ?? '').replace(/[<>`|\\]/g, ' ').replace(/@/g, '@​').replace(/\s+/g, ' ').trim().slice(0, 400);
const code = (s) => '`' + String(s).replace(/`/g, '') + '`';
const pct = (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '–');

const plan = read('plan.json');
const report = read('report.json');
// guard-generate.json: policy check right after the agent ran; guard.json: authoritative re-check
// in the verify job after applying the patch. Violations from either discard the result.
const guardGen = read('guard-generate.json');
const guardVerify = read('guard.json');
const guard = (guardGen || guardVerify) && {
  ok: (guardGen?.ok ?? true) && (guardVerify?.ok ?? true),
  changed: guardVerify?.changed ?? guardGen?.changed ?? [],
  violations: [...(guardGen?.violations ?? []), ...(guardVerify?.violations ?? [])],
};
const verify = read('verify.json');
const reportErrors = report ? validateReport(report) : ['report missing'];
const reportOk = reportErrors.length === 0;

const changedPaths = new Set((guard?.changed ?? []).map((c) => c.path));
const claimed = reportOk ? report.files.filter((f) => f.action !== 'skip' && f.test).map((f) => f.test) : [];
const unbacked = claimed.filter((t) => !changedPaths.has(t));
const consistent = unbacked.length === 0;

const verified = verify?.ok === true && guard?.ok === true;
const noop = reportOk && report.decision === 'no_tests_needed' && changedPaths.size === 0;
const status = !plan ? '⚪ Skipped' : noop ? '✅ No tests needed' : verified && reportOk && consistent ? '✅ Tests generated and verified' : '❌ Needs attention';

const out = [MARKER, '## Unit Test Agent', '', `**Status:** ${status}`];
if (args.committed) out.push(`**Committed to this PR:** ${code(args.committed)}`);
if (reportOk) out.push('', `> ${esc(report.summary)}`);
out.push('');

if (reportOk && report.files.length) {
  out.push('### Agent decisions', '', '| Source | Action | Test file | Reason |', '|---|---|---|---|');
  const icon = { create: 'create', update: 'update', skip: 'skip' };
  for (const f of report.files) out.push(`| ${code(f.source)} | ${icon[f.action]} | ${f.test ? code(f.test) : '–'} | ${esc(f.reason)} |`);
  const cases = report.files.filter((f) => f.cases?.length);
  if (cases.length) {
    out.push('', '<details><summary>Test cases</summary>', '');
    for (const f of cases) { out.push(`**${code(f.test ?? f.source)}**`); for (const c of f.cases) out.push(`- ${esc(c)}`); out.push(''); }
    out.push('</details>');
  }
  out.push('');
} else if (!reportOk && plan) {
  out.push(`Agent report invalid: ${esc(reportErrors.join('; '))}`, '');
}

if (verify) {
  out.push('### Verification (re-run by the pipeline)', '', '| Package | Typecheck | Tests | Repeated runs of new tests | Coverage before → after (lines) |', '|---|---|---|---|---|');
  for (const [pkg, v] of Object.entries(verify.packages ?? {})) {
    const tc = v.typecheck === undefined ? '–' : v.typecheck ? '✅' : '❌';
    const tests = v.tests ? `${v.tests.ok ? '✅' : '❌'} ${v.tests.passed ?? '?'} passed, ${v.tests.failed ?? '?'} failed` : '–';
    const st = v.stability;
    const stability = !st || !st.runs ? '–' : st.failedRuns ? `❌ ${st.failedRuns} of ${st.runs} runs failed (flaky)` : `✅ ${st.runs} of ${st.runs} passed`;
    out.push(`| ${pkg} | ${tc} | ${tests} | ${stability} | ${pct(v.coverage?.before?.lines)} → ${pct(v.coverage?.after?.lines)} |`);
  }
  const files = Object.entries(verify.packages ?? {}).flatMap(([, v]) => v.changedFiles ?? []);
  if (files.length) {
    out.push('', '<details><summary>Coverage of changed source files</summary>', '', '| File | Lines before | Lines after | Branches after |', '|---|---|---|---|');
    for (const f of files) out.push(`| ${code(f.path)} | ${pct(f.before?.lines)} | ${pct(f.after?.lines)} | ${pct(f.after?.branches)} |`);
    out.push('', '</details>');
    // Tests the agent wrote for a file should raise that file's coverage. Flag the ones that did not.
    const written = new Set(reportOk ? report.files.filter((f) => f.action !== 'skip').map((f) => f.source) : []);
    const noGain = files.filter((f) => written.has(f.path) && !f.improved);
    if (noGain.length) {
      out.push('', 'Tests were written for these files, but their line coverage did not increase:');
      for (const f of noGain) out.push(`- ${code(f.path)}`);
    }
  }
  out.push('');
}

if (!consistent) {
  out.push('### Report does not match the patch', '');
  for (const t of unbacked) out.push(`- ${code(t)} is reported as written but was not changed`);
  out.push('');
}
if (guard && !guard.ok) {
  out.push('### Policy violations (result discarded)', '');
  for (const v of guard.violations) out.push(`- ${code(v.path)}: ${esc(v.rule)}`);
  out.push('');
}
if (reportOk && report.suspectedBugs?.length) {
  out.push('### Suspected bugs in production code', '');
  for (const b of report.suspectedBugs) out.push(`- ${code(b.source)}: ${esc(b.description)}`);
  out.push('');
}
if (reportOk && report.warnings?.length) {
  out.push('### Warnings', '');
  for (const w of report.warnings) out.push(`- ${esc(w)}`);
  out.push('');
}
if (plan?.skipped?.length) {
  out.push(`<details><summary>Files outside scope (${plan.skipped.length})</summary>`, '');
  for (const s of plan.skipped.slice(0, 50)) out.push(`- ${code(s.path)}: ${esc(s.reason)}`);
  out.push('', '</details>', '');
}
if (reportOk && report.skillsUsed?.length) out.push(`<sub>Skills: ${report.skillsUsed.map(code).join(', ')}</sub>  `);
if (args['run-url']) out.push(`<sub>[Workflow run, transcript and patch](${args['run-url']})</sub>`);
process.stdout.write(out.join('\n') + '\n');

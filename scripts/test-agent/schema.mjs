#!/usr/bin/env node
// Validates .test-agent/report.json (the agent's structured output) without dependencies.
// Usage: node scripts/test-agent/schema.mjs .test-agent/report.json
import { readFileSync } from 'node:fs';

const DECISIONS = ['tests_added', 'tests_updated', 'no_tests_needed', 'failed'];
const ACTIONS = ['create', 'update', 'skip'];
const str = (v, max = 500) => typeof v === 'string' && v.length <= max;
const strArr = (v, max = 50) => Array.isArray(v) && v.length <= max && v.every((s) => str(s, 300));

export function validateReport(r) {
  const e = [];
  if (typeof r !== 'object' || r === null) return ['report is not an object'];
  if (!str(r.summary, 600)) e.push('summary: string ≤ 600 chars');
  if (!DECISIONS.includes(r.decision)) e.push(`decision: one of ${DECISIONS.join(', ')}`);
  if (!Array.isArray(r.files) || r.files.length > 100) e.push('files: array');
  else r.files.forEach((f, i) => {
    if (!str(f?.source, 300)) e.push(`files[${i}].source`);
    if (!ACTIONS.includes(f?.action)) e.push(`files[${i}].action`);
    if (!(f?.test === null || str(f?.test, 300))) e.push(`files[${i}].test`);
    if (!str(f?.reason, 400)) e.push(`files[${i}].reason`);
    if (!strArr(f?.cases ?? [])) e.push(`files[${i}].cases`);
  });
  if (!Array.isArray(r.testRuns)) e.push('testRuns: array');
  else r.testRuns.forEach((t, i) => {
    if (!['frontend', 'backend'].includes(t?.package)) e.push(`testRuns[${i}].package`);
    if (!str(t?.command, 100)) e.push(`testRuns[${i}].command`);
    if (!Number.isInteger(t?.passed) || !Number.isInteger(t?.failed)) e.push(`testRuns[${i}] counts`);
  });
  if (!strArr(r.skillsUsed ?? [], 20)) e.push('skillsUsed: string[]');
  if (!Array.isArray(r.suspectedBugs ?? []) || !(r.suspectedBugs ?? []).every((b) => str(b?.source, 300) && str(b?.description, 500))) e.push('suspectedBugs');
  if (!strArr(r.warnings ?? [])) e.push('warnings: string[]');
  return e;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] ?? '.test-agent/report.json';
  let report;
  try { report = JSON.parse(readFileSync(file, 'utf8')); } catch (err) { console.error(`invalid report: ${err.message}`); process.exit(1); }
  const errors = validateReport(report);
  if (errors.length) { console.error(`invalid report:\n- ${errors.join('\n- ')}`); process.exit(1); }
  console.log('report ok');
}

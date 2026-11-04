// Defines which paths count as testable source, which count as tests, and which the agent
// may modify. The source rules match coverage include/exclude in frontend/vite.config.ts
// and backend/vitest.config.ts.
import { existsSync } from 'node:fs';
import path from 'node:path';

const FRONTEND_EXCLUDES = [
  /^frontend\/src\/main\.tsx$/,
  /^frontend\/src\/test\//,
  /^frontend\/src\/design-system\//,
  /(^|\/)types\.ts$/,
  /\.types\.ts$/,
  /(^|\/)index\.ts$/,
  /(^|\/)constants\.tsx?$/,
  /\.constants\.ts$/,
  /\.stories\.tsx?$/,
  /\.styles\.ts$/,
  /^frontend\/src\/features\/todos\/api\/queryKeys\.ts$/,
  /^frontend\/src\/lib\/queryClient\.ts$/,
];
const BACKEND_EXCLUDES = [/(^|\/)types\.ts$/, /^backend\/src\/generated\//, /^backend\/src\/main\.ts$/];

export const isTestFile = (p) =>
  /^frontend\/src\/.+\.test\.tsx?$/.test(p) || /^backend\/tests\/.+\.test\.ts$/.test(p);

/** @returns {{pkg: 'frontend'|'backend'} | {skip: string}} */
export function classify(p) {
  if (isTestFile(p)) return { test: p.split('/')[0] };
  if (/^frontend\/src\/.+\.tsx?$/.test(p)) {
    if (FRONTEND_EXCLUDES.some((r) => r.test(p))) return { skip: 'excluded from coverage scope' };
    return { pkg: 'frontend' };
  }
  if (/^backend\/src\/.+\.ts$/.test(p)) {
    if (BACKEND_EXCLUDES.some((r) => r.test(p))) return { skip: 'excluded from coverage scope' };
    return { pkg: 'backend' };
  }
  return { skip: 'not application source' };
}

/** Conventional location of the unit test for a source file (repo-root relative). */
export function testPathFor(source) {
  if (source.startsWith('frontend/')) {
    const { dir, name, ext } = path.posix.parse(source);
    const candidates = [`${dir}/${name}.test${ext}`, `${dir}/${name}.test.ts`, `${dir}/${name}.test.tsx`];
    return candidates.find((c) => existsSync(c)) ?? `${dir}/${name}.test${ext}`;
  }
  const name = path.posix.parse(source).name;
  return `backend/tests/${name}.test.ts`;
}

// guard.mjs rejects a run that changes anything outside these paths.
const AGENT_WRITABLE = [
  /^frontend\/src\/.+\.test\.tsx?$/,
  /^frontend\/src\/test\/[A-Za-z0-9]+Fixture\.ts$/,
  /^backend\/tests\/[A-Za-z0-9_./-]+\.ts$/,
];
export const isAgentWritable = (p) => !p.includes('..') && AGENT_WRITABLE.some((r) => r.test(p));

export const FORBIDDEN_IN_TESTS = [
  { re: /\b(?:it|test|describe)\.(?:only|skip|todo)\b/, why: 'focused/skipped test' },
  { re: /\bx(?:it|describe)\(/, why: 'skipped test' },
  { re: /process\.env\.ANTHROPIC|GITHUB_TOKEN/, why: 'references a CI secret' },
  { re: /\bfetch\(\s*['"`]https?:\/\//, why: 'real network call' },
];

import { afterEach, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const parts = {
  POSTGRES_USER: 'taskly',
  POSTGRES_PASSWORD: 'p@ss:w/rd',
  POSTGRES_HOST: 'db.internal',
  DB_PORT: '5433',
  POSTGRES_DB: 'task ly',
};

// Every variable is stubbed explicitly, so a developer's real .env never influences the result.
function stubEnv(overrides: Partial<Record<keyof typeof parts | 'DATABASE_URL', string>> = {}) {
  vi.stubEnv('DATABASE_URL', '');
  for (const [name, value] of Object.entries({ ...parts, ...overrides })) vi.stubEnv(name, value);
}

afterEach(() => vi.unstubAllEnvs());

it('prefers an explicit override over the environment', () => {
  stubEnv({ DATABASE_URL: 'postgresql://env@host/env' });
  expect(resolveDatabaseUrl('postgresql://override@host/db')).toBe('postgresql://override@host/db');
});

it('uses DATABASE_URL when no override is given', () => {
  stubEnv({ DATABASE_URL: 'postgresql://u:p@host:5432/db' });
  expect(resolveDatabaseUrl()).toBe('postgresql://u:p@host:5432/db');
});

it('normalizes the SQLAlchemy psycopg scheme to plain postgresql', () => {
  stubEnv();
  expect(resolveDatabaseUrl('postgresql+psycopg://u:p@host:5432/db')).toBe('postgresql://u:p@host:5432/db');
});

it('builds a URL from the separate variables and escapes special characters', () => {
  stubEnv();
  const url = new URL(resolveDatabaseUrl());
  expect(url.protocol).toBe('postgresql:');
  expect(url.username).toBe('taskly');
  expect(decodeURIComponent(url.password)).toBe('p@ss:w/rd');
  expect(url.hostname).toBe('db.internal');
  expect(url.port).toBe('5433');
  expect(decodeURIComponent(url.pathname)).toBe('/task ly');
});

it.each(Object.keys(parts))('fails fast when %s is missing', (name) => {
  stubEnv({ [name]: '' });
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});

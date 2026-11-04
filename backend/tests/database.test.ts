import { expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import type { Database } from '../src/features/todos/types.ts';

it('creates a lazily connecting Prisma client with the todo delegate', () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  expect(typeof database.$connect).toBe('function');
  expect(typeof database.todo.findMany).toBe('function');
});

it('creates the todos table idempotently with the expected constraints', async () => {
  const $executeRaw = vi.fn().mockResolvedValue(0);
  await initialize({ $executeRaw } as unknown as Database);

  expect($executeRaw).toHaveBeenCalledTimes(1);
  const sql = ($executeRaw.mock.calls[0][0] as TemplateStringsArray).join('');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
  expect(sql).toContain('title VARCHAR(120) NOT NULL');
  expect(sql).toContain("CHECK (priority IN ('low', 'medium', 'high'))");
  expect(sql).toContain('description VARCHAR(2000) NOT NULL');
  // No interpolated values: the statement is static SQL.
  expect($executeRaw.mock.calls[0]).toHaveLength(1);
});

it('propagates database errors from initialization', async () => {
  const $executeRaw = vi.fn().mockRejectedValue(new Error('permission denied'));
  await expect(initialize({ $executeRaw } as unknown as Database)).rejects.toThrow('permission denied');
});

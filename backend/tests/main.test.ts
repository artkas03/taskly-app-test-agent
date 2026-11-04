import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/lifespan.ts', () => ({ start: vi.fn() }));

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

it('starts the API on import', async () => {
  vi.mocked(start).mockResolvedValue({} as Awaited<ReturnType<typeof start>>);
  await import('../src/main.ts');
  expect(start).toHaveBeenCalledOnce();
  expect(process.exitCode).toBeUndefined();
});

it('logs a startup failure and sets a non-zero exit code', async () => {
  const failure = new Error('Missing environment variable: POSTGRES_USER');
  vi.mocked(start).mockRejectedValue(failure);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  await import('../src/main.ts');
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith('Cannot start Taskly App Node API:', failure));
  expect(process.exitCode).toBe(1);
});

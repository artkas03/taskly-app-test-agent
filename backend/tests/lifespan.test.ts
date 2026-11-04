import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import { resolveDatabaseUrl } from '../src/core/config.ts';
import { createApp } from '../src/factory.ts';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));

class FakeServer extends EventEmitter {
  close = vi.fn((callback?: () => void) => { callback?.(); return this; });
  address() { return { address: '0.0.0.0', family: 'IPv4', port: 8123 }; }
}

let handlers: Record<string, () => void>;
let database: { $connect: ReturnType<typeof vi.fn>; $disconnect: ReturnType<typeof vi.fn> };

function fakeApp(listenError?: Error) {
  const server = new FakeServer();
  // Like http.Server: return the server synchronously, signal readiness or failure asynchronously.
  const listen = vi.fn((port: number, host: string, ready: () => void) => {
    queueMicrotask(() => (listenError ? server.emit('error', listenError) : ready()));
    return server;
  });
  vi.mocked(createApp).mockReturnValue({ listen } as unknown as ReturnType<typeof createApp>);
  return { server, listen };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(resolveDatabaseUrl).mockReturnValue('postgresql://test@localhost/test');
  vi.mocked(createDatabase).mockReturnValue(database as unknown as ReturnType<typeof createDatabase>);
  vi.mocked(initialize).mockResolvedValue(undefined);
  handlers = {};
  // Capture signal handlers instead of registering them on the real test process.
  vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
    handlers[event] = handler;
    return process;
  }) as typeof process.once);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

it('connects, initializes the schema, then listens on API_PORT', async () => {
  vi.stubEnv('API_PORT', '9001');
  const { server, listen } = fakeApp();

  const result = await start();

  expect(createDatabase).toHaveBeenCalledWith('postgresql://test@localhost/test');
  expect(database.$connect).toHaveBeenCalledOnce();
  expect(initialize).toHaveBeenCalledWith(database);
  expect(createApp).toHaveBeenCalledWith(database);
  expect(listen).toHaveBeenCalledWith(9001, '0.0.0.0', expect.any(Function));
  expect(database.$connect.mock.invocationCallOrder[0]).toBeLessThan(listen.mock.invocationCallOrder[0]);
  expect(result).toEqual({ server, database });
  expect(console.log).toHaveBeenCalledWith('Taskly App Node API listening on port 8123');
  expect(Object.keys(handlers).sort()).toEqual(['SIGINT', 'SIGTERM']);
});

it('defaults to port 8000', async () => {
  vi.stubEnv('API_PORT', '');
  const { listen } = fakeApp();
  await start();
  expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
});

it.each(['SIGTERM', 'SIGINT'])('shuts down gracefully on %s', async (signal) => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const { server } = fakeApp();
  await start();

  handlers[signal]();
  await vi.waitFor(() => expect(database.$disconnect).toHaveBeenCalledOnce());

  expect(server.close).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(10_000);
  expect(process.exit).not.toHaveBeenCalled();
  expect(process.exitCode).toBeUndefined();
});

it('forces exit when connections do not close within 10 seconds', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const { server } = fakeApp();
  server.close.mockImplementation(() => server); // never calls back
  await start();

  handlers.SIGTERM();
  vi.advanceTimersByTime(9_999);
  expect(process.exit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(process.exit).toHaveBeenCalledWith(1);
});

it('marks the process as failed when disconnecting during shutdown fails', async () => {
  fakeApp();
  const failure = new Error('disconnect failed');
  database.$disconnect.mockRejectedValue(failure);
  await start();

  handlers.SIGTERM();
  await flush();

  expect(console.error).toHaveBeenCalledWith(failure);
  expect(process.exitCode).toBe(1);
});

it('disconnects and rethrows when the database cannot be reached', async () => {
  const { listen } = fakeApp();
  database.$connect.mockRejectedValue(new Error('ECONNREFUSED'));

  await expect(start()).rejects.toThrow('ECONNREFUSED');

  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(listen).not.toHaveBeenCalled();
  expect(handlers).toEqual({});
});

it('disconnects and rethrows when the port cannot be bound', async () => {
  fakeApp(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }));

  await expect(start()).rejects.toThrow('EADDRINUSE');

  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(handlers).toEqual({});
});

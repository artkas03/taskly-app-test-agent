import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const delegate = {
    findMany: vi.fn().mockResolvedValue([record]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn(),
    create: vi.fn(),
    updateManyAndReturn: vi.fn(),
    deleteMany: vi.fn(),
  };
  const app = createApp({ todo: delegate } as unknown as Database);
  return { app, delegate };
}

it('wires the health and todos routers under /api', async () => {
  const { app, delegate } = setup();
  expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(delegate.findMany).toHaveBeenCalledOnce();
});

it('does not advertise the framework', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/health');
  expect(response.headers).not.toHaveProperty('x-powered-by');
});

it('serves the OpenAPI specification and the docs UI', async () => {
  const { app } = setup();
  const specification = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'));
  const spec = await request(app).get('/openapi.json');
  expect(spec.status).toBe(200);
  expect(spec.body).toEqual(specification);

  const docs = await request(app).get('/docs/');
  expect(docs.status).toBe(200);
  expect(docs.headers['content-type']).toContain('text/html');
});

it('answers unknown routes with a JSON 404', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/unknown');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});

it('rejects malformed JSON with 422 without reaching the repository', async () => {
  const { app, delegate } = setup();
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title": ');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
  expect(delegate.create).not.toHaveBeenCalled();
});

it('rejects bodies over the JSON size limit with 413', async () => {
  const { app, delegate } = setup();
  const response = await request(app).post('/api/todos').send({ title: 'x', description: 'y'.repeat(200_000) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
  expect(delegate.create).not.toHaveBeenCalled();
});

it('hides internal errors behind a generic 500 and logs them', async () => {
  const { app, delegate } = setup();
  const failure = new Error('connection reset');
  delegate.findMany.mockRejectedValue(failure);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  const response = await request(app).get('/api/todos');

  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(JSON.stringify(response.body)).not.toContain('connection reset');
  expect(log).toHaveBeenCalledWith(failure);
});

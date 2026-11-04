import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import type { Database } from '../src/features/todos/types.ts';

function setup(findFirst = vi.fn().mockResolvedValue(null)) {
  const database = { todo: { findFirst } } as unknown as Database;
  const app = express();
  app.use('/api', createHealthRouter(database));
  const onError: ErrorRequestHandler = (error, req, res, next) => res.status(503).json({ error: String(error) });
  app.use(onError);
  return { app, findFirst };
}

it('reports ok after a cheap database round-trip', async () => {
  const { app, findFirst } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});

it('is healthy on an empty or populated table alike', async () => {
  const { app } = setup(vi.fn().mockResolvedValue({ id: 1 }));
  expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
});

it('does not report ok when the database is unreachable', async () => {
  const { app } = setup(vi.fn().mockRejectedValue(new Error('connection refused')));
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(503);
  expect(response.body).not.toHaveProperty('status');
});

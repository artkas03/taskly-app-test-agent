import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn().mockResolvedValue([todo]), create: vi.fn().mockResolvedValue(todo), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
});
it('summarizes tasks for the requested date on /stats instead of treating "stats" as an id', async () => {
  const { app, repository } = setup();
  repository.list.mockResolvedValue([todo, { ...todo, id: 2, completed: true, priority: 'low' }]);
  const response = await request(app).get('/api/todos/stats').query({ today: '2026-10-16' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    total: 2, active: 1, completed: 1, overdue: 1, completionRate: 50,
    byPriority: { low: 1, medium: 0, high: 1 },
  });
  expect(repository.get).not.toHaveBeenCalled();
});

it('uses the current UTC date for /stats when no date is given', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
    const { app } = setup();
    const response = await request(app).get('/api/todos/stats');
    expect(response.status).toBe(200);
    expect(response.body.overdue).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

it.each([{ today: '2026-02-30' }, { today: 'tomorrow' }, { other: '1' }])(
  'rejects invalid stats query %j without reading tasks', async (query) => {
    const { app, repository } = setup();
    const response = await request(app).get('/api/todos/stats').query(query);
    expect(response.status).toBe(422);
    expect(response.body.detail).toEqual(expect.any(Array));
    expect(repository.list).not.toHaveBeenCalled();
  },
);

it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, completed: false });
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);

it('gets a task by id', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(todo);
  const response = await request(app).get('/api/todos/1');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
});

it.each(['get', 'patch', 'delete'] as const)('returns 404 when %s targets a missing task', async (method) => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  repository.update.mockResolvedValue(null);
  repository.delete.mockResolvedValue(false);
  const response = await request(app)[method]('/api/todos/99').send(method === 'patch' ? { completed: true } : undefined);
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});

it.each(['0', '-1', '1.5', 'abc', '9007199254740992'])('rejects the invalid id %s before touching the repository', async (id) => {
  const { app, repository } = setup();
  for (const method of ['get', 'patch', 'delete'] as const) {
    expect((await request(app)[method](`/api/todos/${id}`).send({ completed: true })).status).toBe(422);
  }
  expect(repository.get).not.toHaveBeenCalled();
  expect(repository.update).not.toHaveBeenCalled();
  expect(repository.delete).not.toHaveBeenCalled();
});

it('updates a task with the validated partial payload', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue({ ...todo, title: 'Renamed', completed: true });
  const response = await request(app).patch('/api/todos/1').send({ title: '  Renamed ', completed: true });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ title: 'Renamed', completed: true });
  expect(repository.update).toHaveBeenCalledWith(1, { title: 'Renamed', completed: true });
});

it.each([{}, { id: 2 }, { completed: 'yes' }, { due_date: '2026-13-01' }])(
  'rejects the invalid update %j without calling the repository', async (payload) => {
    const { app, repository } = setup();
    const response = await request(app).patch('/api/todos/1').send(payload);
    expect(response.status).toBe(422);
    expect(response.body.detail).toEqual(expect.any(Array));
    expect(repository.update).not.toHaveBeenCalled();
  },
);

it('deletes a task and answers 204 without a body', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(true);
  const response = await request(app).delete('/api/todos/1');
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(repository.delete).toHaveBeenCalledWith(1);
});

import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from './todos'

vi.mock('../../../lib/http', () => ({ request: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('passes the abort signal when fetching tasks', async () => {
  const signal = new AbortController().signal
  vi.mocked(request).mockResolvedValue([todoFixture])
  await expect(todosApi.list(signal)).resolves.toEqual([todoFixture])
  expect(request).toHaveBeenCalledWith('/todos', { signal })
})

it('sends only writable task fields on creation', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await expect(todosApi.create(todoFixture)).resolves.toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos', {
    method: 'POST',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: false,
    }),
  })
})

it('sends only writable fields when updating and omits undefined ones', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await expect(
    todosApi.update(7, { ...todoFixture, completed: true }),
  ).resolves.toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos/7', {
    method: 'PATCH',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: true,
    }),
  })

  await todosApi.update(7, { completed: false })
  expect(vi.mocked(request).mock.calls[1][1]?.body).toBe(
    JSON.stringify({ completed: false }),
  )
})

it('deletes a task by id', async () => {
  vi.mocked(request).mockResolvedValue(undefined)
  await expect(todosApi.remove(7)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledWith('/todos/7', { method: 'DELETE' })
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

it('prefixes the API path, sends JSON headers and returns the parsed body', async () => {
  fetchMock.mockResolvedValue(jsonResponse([{ id: 1 }]))
  await expect(
    request('/todos', { method: 'POST', headers: { 'X-Trace': 'abc' } }),
  ).resolves.toEqual([{ id: 1 }])
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trace': 'abc' },
  })
})

it('resolves to undefined for 204 No Content without parsing a body', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  await expect(
    request('/todos/1', { method: 'DELETE' }),
  ).resolves.toBeUndefined()
})

it('replaces network failures with a user-friendly message', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException('Aborted', 'AbortError')
  fetchMock.mockRejectedValue(abortError)
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})

it('explains the field limits when the server rejects the payload (422)', async () => {
  fetchMock.mockResolvedValue(
    jsonResponse({ detail: [{ path: ['title'] }] }, 422),
  )
  await expect(request('/todos', { method: 'POST' })).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('surfaces the server detail message for other error statuses', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ detail: 'Task not found.' }, 404))
  await expect(request('/todos/99')).rejects.toThrow('Task not found.')
})

it.each([
  ['a non-JSON body', () => new Response('Bad gateway', { status: 502 })],
  ['a non-string detail', () => jsonResponse({ detail: { code: 1 } }, 500)],
])('falls back to a generic message for %s', async (_, response) => {
  fetchMock.mockResolvedValue(response())
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

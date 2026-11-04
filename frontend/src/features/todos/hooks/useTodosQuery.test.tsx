import { renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useTodosQuery } from './useTodosQuery'

vi.mock('../api/todos', () => ({ todosApi: { list: vi.fn() } }))

it('loads tasks with an abort signal and caches them under the list key', async () => {
  const { client, wrapper } = createQueryWrapper()
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])

  const { result } = renderHook(() => useTodosQuery(), { wrapper })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([todoFixture])
  expect(todosApi.list).toHaveBeenCalledWith(expect.any(AbortSignal))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('exposes the error when loading fails', async () => {
  const { wrapper } = createQueryWrapper()
  vi.mocked(todosApi.list).mockRejectedValue(new Error('Server unavailable'))

  const { result } = renderHook(() => useTodosQuery(), { wrapper })

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe('Server unavailable')
})

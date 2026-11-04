import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { update: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

it('updates the task by id and replaces only that task in the cache', async () => {
  const { client, wrapper } = createQueryWrapper()
  const other = { ...todoFixture, id: 1, title: 'Other' }
  const saved = { ...todoFixture, completed: true }
  client.setQueryData(todoKeys.list, [todoFixture, other])
  vi.mocked(todosApi.update).mockResolvedValue(saved)

  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(() =>
    result.current.mutateAsync({
      id: todoFixture.id,
      input: { completed: true },
    }),
  )

  expect(todosApi.update).toHaveBeenCalledWith(todoFixture.id, {
    completed: true,
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, other])
})

it('leaves an unloaded list cache empty', async () => {
  const { client, wrapper } = createQueryWrapper()
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)

  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(() =>
    result.current.mutateAsync({ id: 7, input: { title: 'New' } }),
  )

  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

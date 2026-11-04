import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { remove: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

it('deletes by id and removes the task from the cached list', async () => {
  const { client, wrapper } = createQueryWrapper()
  const other = { ...todoFixture, id: 1 }
  client.setQueryData(todoKeys.list, [todoFixture, other])
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)

  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture.id))

  expect(todosApi.remove).toHaveBeenCalledWith(todoFixture.id)
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})

it('keeps the cached list when deletion fails', async () => {
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Could not delete.'))

  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(() =>
    expect(result.current.mutateAsync(todoFixture.id)).rejects.toThrow(
      'Could not delete.',
    ),
  )

  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

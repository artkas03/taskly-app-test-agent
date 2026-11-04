import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { TodoInput } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

const input: TodoInput = {
  title: 'Write tests',
  description: '',
  priority: 'high',
  due_date: null,
  completed: false,
}

it('sends the input and prepends the saved task to the cached list', async () => {
  const { client, wrapper } = createQueryWrapper()
  const existing = { ...todoFixture, id: 1 }
  const saved = { ...todoFixture, ...input, id: 8 }
  client.setQueryData(todoKeys.list, [existing])
  vi.mocked(todosApi.create).mockResolvedValue(saved)

  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(input))

  expect(todosApi.create).toHaveBeenCalledWith(input)
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, existing])
})

it('does not duplicate a task that a refetch already added', async () => {
  const { client, wrapper } = createQueryWrapper()
  const saved = { ...todoFixture, id: 8 }
  client.setQueryData(todoKeys.list, [saved])
  vi.mocked(todosApi.create).mockResolvedValue(saved)

  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(input))

  expect(client.getQueryData(todoKeys.list)).toEqual([saved])
})

it('starts the list cache when nothing was loaded yet', async () => {
  const { client, wrapper } = createQueryWrapper()
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)

  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(input))

  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('keeps the cache unchanged and exposes the error when creation fails', async () => {
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Server error'))

  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() =>
    expect(result.current.mutateAsync(input)).rejects.toThrow('Server error'),
  )

  await waitFor(() =>
    expect(result.current.error?.message).toBe('Server error'),
  )
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

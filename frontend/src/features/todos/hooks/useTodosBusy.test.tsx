import { useMutation } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClient'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function useBusyWithMutation(mutationKey: readonly string[]) {
  const mutation = useMutation({
    mutationKey,
    // Never settles, so the mutation stays in flight for the assertion.
    mutationFn: () => new Promise<void>(() => {}),
  })
  return { busy: useTodosBusy(), start: () => mutation.mutate() }
}

it('is idle when no task mutation is running', () => {
  const { wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useTodosBusy(), { wrapper })
  expect(result.current).toBe(false)
})

// Each row is wrapped in a tuple: it.each would otherwise spread the key array into arguments.
it.each([[todoKeys.create], [todoKeys.update], [todoKeys.delete]])(
  'is busy while a %j mutation is in flight',
  async (key) => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useBusyWithMutation(key), { wrapper })
    act(() => result.current.start())
    await waitFor(() => expect(result.current.busy).toBe(true))
  },
)

it('ignores mutations that do not belong to tasks', async () => {
  const { wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useBusyWithMutation(['settings']), {
    wrapper,
  })
  act(() => result.current.start())
  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)))
  expect(result.current.busy).toBe(false)
})

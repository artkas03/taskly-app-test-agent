import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const active: Todo = {
  ...todoFixture,
  id: 1,
  title: 'Buy milk',
  priority: 'low',
}
const done: Todo = {
  ...todoFixture,
  id: 2,
  title: 'Ship release',
  priority: 'high',
  completed: true,
  created_at: '2026-10-02T12:00:00Z',
}

it('starts with all tasks, no search and newest first', () => {
  const { result } = renderHook(() => useTodoFilters([active, done]))
  expect(result.current).toMatchObject({
    filter: 'all',
    search: '',
    sort: 'newest',
  })
  expect(result.current.visible).toEqual([done, active])
})

it('recomputes the visible tasks when filter, search or sort change', () => {
  const { result } = renderHook(() => useTodoFilters([active, done]))

  act(() => result.current.setFilter('active'))
  expect(result.current.visible).toEqual([active])

  act(() => {
    result.current.setFilter('all')
    result.current.setSearch('ship')
  })
  expect(result.current.visible).toEqual([done])

  act(() => {
    result.current.setSearch('')
    result.current.setSort('priority')
  })
  expect(result.current.visible).toEqual([done, active])
})

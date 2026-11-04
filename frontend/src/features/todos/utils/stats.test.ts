import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { summarizeTodos } from './stats'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-10T12:00:00'))
})
afterEach(() => vi.useRealTimers())

describe('summarizeTodos', () => {
  it('returns zeros for an empty list', () => {
    expect(summarizeTodos([])).toEqual({
      total: 0,
      active: 0,
      completed: 0,
      overdue: 0,
      completionRate: 0,
    })
  })

  it('counts completed, active and overdue tasks and rounds the rate', () => {
    const todos = [
      { ...todoFixture, id: 1, completed: true, due_date: '2026-10-01' },
      { ...todoFixture, id: 2, completed: true },
      { ...todoFixture, id: 3, due_date: '2026-10-09' },
    ]
    expect(summarizeTodos(todos)).toEqual({
      total: 3,
      active: 1,
      completed: 2,
      overdue: 1,
      completionRate: 67,
    })
  })
})

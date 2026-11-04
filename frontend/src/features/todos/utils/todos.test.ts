import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('shows only completed tasks with the completed filter', () => {
    const done = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('searches the title as well as the description', () => {
    const other = { ...base, id: 2, title: 'Buy milk' }
    expect(selectTodos([base, other], 'all', 'MILK', 'newest')).toEqual([other])
  })

  it('sorts by due date, earliest first, with undated tasks last', () => {
    const late = { ...base, id: 2, due_date: '2026-12-01' }
    const soon = { ...base, id: 3, due_date: '2026-10-20' }
    expect(selectTodos([base, late, soon], 'all', '', 'due')).toEqual([
      soon,
      late,
      base,
    ])
  })

  it('sorts newest first and breaks ties by the higher id', () => {
    const older = { ...base, id: 5, created_at: '2026-09-01T12:00:00Z' }
    const sameTime = { ...base, id: 2 }
    expect(selectTodos([older, base, sameTime], 'all', '', 'newest')).toEqual([
      sameTime,
      base,
      older,
    ])
  })

  it('breaks priority and due-date ties by the higher id', () => {
    const twin = { ...base, id: 2 }
    expect(selectTodos([base, twin], 'all', '', 'priority')).toEqual([
      twin,
      base,
    ])
    expect(selectTodos([base, twin], 'all', '', 'due')).toEqual([twin, base])
  })
})

describe('validateTodo', () => {
  const valid: TodoInput = {
    title: 'Task',
    description: '',
    priority: 'low',
    due_date: null,
    completed: false,
  }

  it('accepts a valid task, including a real calendar date', () => {
    expect(validateTodo(valid)).toEqual({})
    expect(validateTodo({ ...valid, due_date: '2028-02-29' })).toEqual({})
  })

  it.each([
    [{ title: '   ' }, { title: 'Enter a task title.' }],
    [
      { title: 'x'.repeat(121) },
      { title: 'The title must be at most 120 characters.' },
    ],
    [
      { description: 'y'.repeat(2001) },
      { description: 'The description must be at most 2000 characters.' },
    ],
    [{ due_date: '2026-02-30' }, { due_date: 'Enter a valid date.' }],
    [{ due_date: '15.10.2026' }, { due_date: 'Enter a valid date.' }],
  ])('rejects %j', (patch, errors) => {
    expect(validateTodo({ ...valid, ...patch })).toEqual(errors)
  })

  it('measures limits after trimming surrounding whitespace', () => {
    expect(validateTodo({ ...valid, title: ` ${'x'.repeat(120)} ` })).toEqual(
      {},
    )
  })

  it('reports every invalid field at once', () => {
    expect(
      Object.keys(
        validateTodo({
          ...valid,
          title: '',
          description: 'y'.repeat(2001),
          due_date: 'nope',
        }),
      ),
    ).toEqual(['title', 'description', 'due_date'])
  })
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ['yesterday and active', { due_date: '2026-10-09' }, true],
    ['due today', { due_date: '2026-10-10' }, false],
    ['in the future', { due_date: '2026-10-11' }, false],
    ['past but completed', { due_date: '2026-10-09', completed: true }, false],
    ['without a due date', { due_date: null }, false],
  ])('is %s → %s', (_, patch, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 10, 12, 0))
    expect(isOverdue({ ...base, ...patch })).toBe(expected)
  })
})

describe('formatDate', () => {
  it('formats a calendar date in British style without shifting the day', () => {
    expect(formatDate('2026-10-15')).toBe('15 Oct 2026')
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026')
  })
})

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoStats } from './TodoStats'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-10T12:00:00'))
})
afterEach(() => vi.useRealTimers())

it('renders nothing when there are no tasks', () => {
  render(<TodoStats todos={[]} />)
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
})

it('shows progress and the active count without an overdue badge', () => {
  render(
    <TodoStats
      todos={[
        { ...todoFixture, id: 1, completed: true },
        { ...todoFixture, id: 2, due_date: '2026-10-10' },
      ]}
    />,
  )
  const section = screen.getByRole('region', { name: 'Task statistics' })
  expect(section).toHaveTextContent('1 of 2 done (50%)')
  expect(section).toHaveTextContent('1 active')
  expect(section).not.toHaveTextContent('overdue')
})

it('shows the overdue badge when an active task is past due', () => {
  render(
    <TodoStats todos={[{ ...todoFixture, due_date: '2026-10-09' }]} />,
  )
  expect(screen.getByText('1 overdue')).toBeInTheDocument()
})

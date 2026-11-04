import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

afterEach(() => vi.useRealTimers())

function renderItem(todo = todoFixture, busy = false) {
  const handlers = { onEdit: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn() }
  render(<TodoItem todo={todo} busy={busy} {...handlers} />)
  return handlers
}

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it('shows a completed task with its description and forwards toggle and delete', async () => {
  const user = userEvent.setup()
  const todo = {
    ...todoFixture,
    completed: true,
    description: 'Slides and demo',
    priority: 'high' as const,
  }
  const { onToggle, onDelete, onEdit } = renderItem(todo)

  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.getByText('High')).toBeVisible()
  expect(screen.getByText('Slides and demo')).toBeVisible()
  expect(
    screen.getByRole('checkbox', { name: `Mark as active: ${todo.title}` }),
  ).toBeChecked()

  await user.click(screen.getByRole('checkbox'))
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todo.title}` }),
  )
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onEdit).not.toHaveBeenCalled()
})

it('omits the description and due date when they are empty', () => {
  renderItem()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(screen.getByText(`#${todoFixture.id}`)).toBeVisible()
})

it('marks a past due date as overdue', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0))
  renderItem({ ...todoFixture, due_date: '2026-10-15' })
  expect(screen.getByText(/15 Oct 2026/)).toHaveTextContent(
    '15 Oct 2026 · overdue',
  )
})

it('shows a future due date without the overdue label', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 1, 12, 0))
  renderItem({ ...todoFixture, due_date: '2026-10-15' })
  expect(screen.getByText(/15 Oct 2026/)).not.toHaveTextContent('overdue')
})

it('disables every action while busy', () => {
  renderItem(todoFixture, true)
  expect(screen.getByRole('checkbox')).toBeDisabled()
  for (const button of screen.getAllByRole('button'))
    expect(button).toBeDisabled()
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: ({ hasTodos }: { hasTodos: boolean }) => (
    <p>{hasTodos ? 'No matches' : 'Empty task list'}</p>
  ),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      {todo.title}
      {busy && ' (busy)'}
      <button onClick={onToggle}>Toggle {todo.id}</button>
      <button onClick={onEdit}>Edit {todo.id}</button>
      <button onClick={onDelete}>Delete {todo.id}</button>
    </li>
  ),
}))

const baseProps = {
  todos: [] as Todo[],
  hasTodos: false,
  loading: false,
  failed: false,
  busy: false,
  onCreate: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

it('shows loading feedback before showing an empty list', () => {
  const props = {
    todos: [],
    hasTodos: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})

it('shows an unavailable message when loading failed and nothing is cached', () => {
  render(<TodoList {...baseProps} failed />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('keeps showing cached tasks when a refetch failed', () => {
  render(<TodoList {...baseProps} failed hasTodos todos={[todoFixture]} />)
  expect(screen.getByRole('listitem')).toHaveTextContent(todoFixture.title)
  expect(
    screen.queryByRole('heading', { name: /unavailable/ }),
  ).not.toBeInTheDocument()
})

it('renders every task and passes the task to each callback', async () => {
  const user = userEvent.setup()
  const second = { ...todoFixture, id: 8, title: 'Second' }
  const props = {
    ...baseProps,
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  render(<TodoList {...props} hasTodos busy todos={[todoFixture, second]} />)

  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Second (busy)')

  await user.click(screen.getByRole('button', { name: 'Toggle 8' }))
  await user.click(screen.getByRole('button', { name: 'Edit 7' }))
  await user.click(screen.getByRole('button', { name: 'Delete 8' }))
  expect(props.onToggle).toHaveBeenCalledWith(second)
  expect(props.onEdit).toHaveBeenCalledWith(todoFixture)
  expect(props.onDelete).toHaveBeenCalledWith(second)
})

it('shows the "no matches" state when tasks exist but none are visible', () => {
  render(<TodoList {...baseProps} hasTodos />)
  expect(screen.getByText('No matches')).toBeVisible()
})

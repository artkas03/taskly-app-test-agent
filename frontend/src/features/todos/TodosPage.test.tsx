import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: () => <h1>Tasks</h1>,
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
// Child components are replaced by small doubles that expose their callbacks as buttons, so the
// tests can check which dialog the page opens and what it announces.
vi.mock('./components/TodoList', () => ({
  TodoList: (props: {
    onCreate: () => void
    onToggle: (todo: Todo) => void
    onEdit: (todo: Todo) => void
    onDelete: (todo: Todo) => void
  }) => (
    <div>
      <p>Task list</p>
      <button onClick={props.onCreate}>List: create</button>
      <button onClick={() => props.onToggle(todoFixture)}>List: toggle</button>
      <button onClick={() => props.onEdit(todoFixture)}>List: edit</button>
      <button onClick={() => props.onDelete(todoFixture)}>List: delete</button>
    </div>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: (props: {
    todo: Todo | 'new'
    onClose: () => void
    onSaved: (notice: string) => void
  }) => (
    <div role="dialog" aria-label="Editor">
      {props.todo === 'new' ? 'New task' : `Editing ${props.todo.title}`}
      <button onClick={props.onClose}>Editor: close</button>
      <button onClick={() => props.onSaved('Task saved.')}>Editor: save</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: (props: {
    todo: Todo
    onClose: () => void
    onDeleted: () => void
  }) => (
    <div role="dialog" aria-label="Delete">
      Deleting {props.todo.title}
      <button onClick={props.onClose}>Delete: cancel</button>
      <button onClick={props.onDeleted}>Delete: confirm</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

beforeEach(() => vi.clearAllMocks())

function setupPage({
  busy = false,
  mutateAsync = vi.fn(),
  mutationError = null as Error | null,
  queryError = null as Error | null,
} = {}) {
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todoFixture],
    isPending: false,
    isFetching: false,
    isError: queryError !== null,
    error: queryError,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: mutationError,
    reset: vi.fn(),
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [todoFixture],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  return { notify, mutateAsync, user: userEvent.setup() }
}

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('shows no alert when nothing failed', () => {
  setupPage()
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
})

it('prefers the toggle error over the query error in the alert', () => {
  setupPage({
    mutationError: new Error('Toggle failed.'),
    queryError: new Error('Load failed.'),
  })
  expect(screen.getByTestId('alert')).toHaveTextContent('Toggle failed.')
  expect(screen.getByTestId('alert')).not.toHaveTextContent('Load failed.')
})

it.each([
  [true, 'Another task complete. Well done!'],
  [false, 'Task marked as active.'],
])(
  'toggles a task and announces the new state (completed=%s)',
  async (completed, message) => {
    const mutateAsync = vi.fn().mockResolvedValue({ ...todoFixture, completed })
    const { notify, user } = setupPage({ mutateAsync })

    await user.click(screen.getByRole('button', { name: 'List: toggle' }))

    expect(mutateAsync).toHaveBeenCalledWith({
      id: todoFixture.id,
      input: { completed: true },
    })
    expect(notify).toHaveBeenCalledWith(message)
  },
)

it('does not announce anything when toggling fails', async () => {
  const mutateAsync = vi.fn().mockRejectedValue(new Error('Toggle failed.'))
  const { notify, user } = setupPage({ mutateAsync })

  await user.click(screen.getByRole('button', { name: 'List: toggle' }))

  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(notify).not.toHaveBeenCalled()
})

it('ignores toggles while another task operation is running', async () => {
  const { mutateAsync, user } = setupPage({ busy: true })
  await user.click(screen.getByRole('button', { name: 'List: toggle' }))
  expect(mutateAsync).not.toHaveBeenCalled()
})

it('opens the editor for a new task and announces the save', async () => {
  const { notify, user } = setupPage()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'List: create' }))
  expect(screen.getByRole('dialog', { name: 'Editor' })).toHaveTextContent(
    'New task',
  )

  await user.click(screen.getByRole('button', { name: 'Editor: save' }))
  expect(notify).toHaveBeenCalledWith('Task saved.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('opens the editor for an existing task and closes it without notifying', async () => {
  const { notify, user } = setupPage()

  await user.click(screen.getByRole('button', { name: 'List: edit' }))
  expect(screen.getByRole('dialog', { name: 'Editor' })).toHaveTextContent(
    `Editing ${todoFixture.title}`,
  )

  await user.click(screen.getByRole('button', { name: 'Editor: close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it('confirms deletion through the dialog and announces it', async () => {
  const { notify, user } = setupPage()

  await user.click(screen.getByRole('button', { name: 'List: delete' }))
  expect(screen.getByRole('dialog', { name: 'Delete' })).toHaveTextContent(
    `Deleting ${todoFixture.title}`,
  )

  await user.click(screen.getByRole('button', { name: 'Delete: confirm' }))
  expect(notify).toHaveBeenCalledWith('Task deleted.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('cancels deletion without announcing anything', async () => {
  const { notify, user } = setupPage()
  await user.click(screen.getByRole('button', { name: 'List: delete' }))
  await user.click(screen.getByRole('button', { name: 'Delete: cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

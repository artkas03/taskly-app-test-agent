import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useDeleteTodoMutation } from '../hooks/useDeleteTodoMutation'
import { DeleteTodoDialog } from './DeleteTodoDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useDeleteTodoMutation', () => ({
  useDeleteTodoMutation: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

function mockMutation(
  overrides: Partial<{
    isPending: boolean
    error: Error | null
    mutateAsync: ReturnType<typeof vi.fn>
  }> = {},
) {
  const mutation = {
    isPending: false,
    error: null,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  vi.mocked(useDeleteTodoMutation).mockReturnValue(
    mutation as unknown as ReturnType<typeof useDeleteTodoMutation>,
  )
  return mutation
}

function renderDialog(busy = false) {
  const handlers = { onClose: vi.fn(), onDeleted: vi.fn() }
  render(<DeleteTodoDialog todo={todoFixture} busy={busy} {...handlers} />)
  return handlers
}

it('shows a deletion error and allows cancelling without deleting', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn()
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending: false,
    error: new Error('Could not delete.'),
    mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
  expect(
    screen.getByText(
      `The task “${todoFixture.title}” will be permanently deleted.`,
    ),
  ).toBeVisible()
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not delete.')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})

it('deletes the task by id and reports success', async () => {
  const user = userEvent.setup()
  const { mutateAsync } = mockMutation()
  const { onDeleted, onClose } = renderDialog()

  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete task' }))

  expect(mutateAsync).toHaveBeenCalledWith(todoFixture.id)
  expect(onDeleted).toHaveBeenCalledTimes(1)
  expect(onClose).not.toHaveBeenCalled()
})

it('stays open when deletion fails so the user can retry', async () => {
  const user = userEvent.setup()
  mockMutation({
    mutateAsync: vi.fn().mockRejectedValue(new Error('Could not delete.')),
  })
  const { onDeleted } = renderDialog()

  await user.click(screen.getByRole('button', { name: 'Delete task' }))

  expect(onDeleted).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
})

it('shows progress and blocks every action while the deletion is pending', () => {
  mockMutation({ isPending: true })
  renderDialog()
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
})

it('does not delete while another task operation is running', () => {
  const { mutateAsync } = mockMutation()
  renderDialog(true)
  const deleteButton = screen.getByRole('button', { name: 'Deleting…' })
  expect(deleteButton).toBeDisabled()
  deleteButton.click()
  expect(mutateAsync).not.toHaveBeenCalled()
})

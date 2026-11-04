---
name: write-frontend-unit-tests
description: Conventions and patterns for writing Vitest + React Testing Library unit tests in frontend/ (components, hooks, TanStack Query mutations, API client, utils). Use when creating or updating any frontend test.
---

# Frontend unit tests (Vitest + RTL)

The environment is `jsdom` with globals off, so import `it`, `expect` and `vi` from `vitest`. The setup file `src/test/setup.ts` registers the `jest-dom` matchers and RTL `cleanup`.

## File placement and naming

- Put the test next to the source: `src/features/todos/components/TodoList.tsx` gets `TodoList.test.tsx` in the same folder.
- Use `.test.tsx` when the test renders JSX, otherwise `.test.ts`.
- Shared data is in `src/test/todoFixture.ts` (`todoFixture`). Change it with a spread: `{ ...todoFixture, completed: true }`.
- `src/test/queryClient.tsx` exports `createQueryWrapper()` for hook tests.

## Patterns this repo already uses

Replace the design system with the test doubles in every component test:
```ts
vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
```
Adjust the relative path. The doubles render native elements: `Drawer` becomes `role="dialog"` with `aria-label={title}`, `Alert` gets `data-testid="alert"`, and `Input`, `Select` and `Checkbox` render labelled controls.

Mock child components and hooks of the unit under test at the module boundary:
```ts
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mocked(useTodosQuery).mockReturnValue({ data: [], isPending: false } as unknown as ReturnType<typeof useTodosQuery>)
```

For the API layer, mock `request` from `src/lib/http` and assert the method, path and body:
```ts
vi.mock('../../../lib/http', () => ({ request: vi.fn() }))
```

To test `src/lib/http.ts` itself, stub `fetch` with `vi.stubGlobal('fetch', vi.fn())`, restore it with `vi.unstubAllGlobals()` in `afterEach`, and return `new Response(JSON.stringify(body), { status })`.

Render hooks that use TanStack Query with a fresh client per test and no retries:
```tsx
const { client, wrapper } = createQueryWrapper()
const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
await act(() => result.current.mutateAsync(input))
expect(client.getQueryData(todoKeys.list)).toEqual([...])
```
In hook tests, mock `todosApi` (`vi.mock('../api/todos', ...)`) rather than `fetch`.

For interaction, create `const user = userEvent.setup()` and use `await user.click(...)` or `user.type(...)`.

Query by role first (`getByRole(..., { name })`), then `getByLabelText`, then `getByText`. Avoid `container.querySelector` and test IDs, except where a double only exposes a test ID (`alert`).

For async results, use `await screen.findBy...` or `await waitFor(() => expect(...))`. Never wait with `setTimeout`.

For "overdue" or "today" logic, use `vi.useFakeTimers({ toFake: ['Date'] })` with `vi.setSystemTime(new Date('2026-10-10T12:00:00'))`, and call `vi.useRealTimers()` afterwards.

## Checklist

- One behaviour per `it`, and the name states it: `it('keeps the dialog open when deletion fails')`.
- Assert what the user sees and, where it matters, the call to the collaborator (callback or API).
- Cover each branch the diff added, such as loading, error, empty, populated, or disabled while busy.
- Use `it.each` for tables of inputs (validation rules, sort orders). Wrap array rows in a tuple, `[[key]]`, because `it.each` spreads arrays into arguments.
- Reset shared mocks with `beforeEach(() => vi.clearAllMocks())`.
- Comment only what a reader could not work out from the code, for example why a child component is replaced by a double that exposes its callbacks as buttons. No comments that narrate steps (`// arrange`, `// click the button`).

## Avoid

- Rendering the real design system (styled-components theme). Use the mocks.
- Snapshots of whole components.
- Tests for design-system components, stories, types or barrel files, which are excluded from coverage.

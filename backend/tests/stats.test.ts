import { describe, it, expect } from 'vitest';
import { summarizeTodos } from '../src/features/todos/stats.ts';
import { todo } from './fixture.ts';

const make = (overrides: Partial<typeof todo>) => ({ ...todo, ...overrides });

describe('summarizeTodos', () => {
  it('returns zeros for an empty list without dividing by zero', () => {
    expect(summarizeTodos([], '2026-10-10')).toEqual({
      total: 0, active: 0, completed: 0, overdue: 0, completionRate: 0,
      byPriority: { low: 0, medium: 0, high: 0 },
    });
  });

  it('counts totals, completion and priorities', () => {
    const todos = [
      make({ id: 1, priority: 'high', completed: true, due_date: null }),
      make({ id: 2, priority: 'low', completed: false, due_date: null }),
      make({ id: 3, priority: 'low', completed: false, due_date: null }),
    ];
    expect(summarizeTodos(todos, '2026-10-10')).toEqual({
      total: 3, active: 2, completed: 1, overdue: 0, completionRate: 33,
      byPriority: { low: 2, medium: 0, high: 1 },
    });
  });

  it('rounds the completion rate to the nearest percent', () => {
    const todos = [
      make({ id: 1, completed: true }), make({ id: 2, completed: true }), make({ id: 3, completed: false }),
    ];
    expect(summarizeTodos(todos, '2000-01-01').completionRate).toBe(67);
  });

  it('counts only active tasks due before today as overdue', () => {
    const todos = [
      make({ id: 1, due_date: '2026-10-09' }),
      make({ id: 2, due_date: '2026-10-10' }),
      make({ id: 3, due_date: '2026-10-11' }),
      make({ id: 4, due_date: null }),
      make({ id: 5, due_date: '2026-10-01', completed: true }),
    ];
    expect(summarizeTodos(todos, '2026-10-10').overdue).toBe(1);
  });
});

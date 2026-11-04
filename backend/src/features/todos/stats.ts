import type { Todo } from './types.js';

export interface TodoStats {
  total: number;
  active: number;
  completed: number;
  overdue: number;
  completionRate: number;
  byPriority: Record<Todo['priority'], number>;
}

/** Aggregates task counts. `today` is a calendar date (YYYY-MM-DD) in the caller's time zone. */
export function summarizeTodos(todos: Todo[], today: string): TodoStats {
  const byPriority = { low: 0, medium: 0, high: 0 };
  let completed = 0;
  let overdue = 0;
  for (const todo of todos) {
    byPriority[todo.priority] += 1;
    if (todo.completed) completed += 1;
    else if (todo.due_date && todo.due_date < today) overdue += 1;
  }
  const total = todos.length;
  return {
    total,
    active: total - completed,
    completed,
    overdue,
    completionRate: total ? Math.round((completed / total) * 100) : 0,
    byPriority,
  };
}

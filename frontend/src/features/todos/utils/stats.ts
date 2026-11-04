import type { Todo } from '../types'
import { isOverdue } from './todos'

export interface TodoSummary {
  total: number
  active: number
  completed: number
  overdue: number
  completionRate: number
}

export function summarizeTodos(todos: Todo[]): TodoSummary {
  const completed = todos.filter((todo) => todo.completed).length
  const total = todos.length
  return {
    total,
    active: total - completed,
    completed,
    overdue: todos.filter(isOverdue).length,
    completionRate: total ? Math.round((completed / total) * 100) : 0,
  }
}

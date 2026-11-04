import { Badge, Text } from '../../../design-system'
import type { Todo } from '../types'
import { summarizeTodos } from '../utils/stats'

export function TodoStats({ todos }: { todos: Todo[] }) {
  if (!todos.length) return null
  const stats = summarizeTodos(todos)
  return (
    <section className="row compact" aria-label="Task statistics">
      <Text as="span" muted size="small">
        {stats.completed} of {stats.total} done ({stats.completionRate}%)
      </Text>
      <Badge variant="info">{stats.active} active</Badge>
      {stats.overdue > 0 && (
        <Badge variant="warning">{stats.overdue} overdue</Badge>
      )}
    </section>
  )
}

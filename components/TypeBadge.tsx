import { TYPE_COLORS, TYPE_LABELS } from '@/lib/constants'
import type { EventType } from '@/lib/types/database'

export function TypeBadge({ type }: { type: EventType }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[type].badge}`}>
      {TYPE_LABELS[type]}
    </span>
  )
}

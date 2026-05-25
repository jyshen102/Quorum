import type { EventStatus } from '@/lib/types/database'

export function StatusDot({ status }: { status: EventStatus }) {
  if (status === 'open') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-700">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        Open
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className="h-2 w-2 rounded-full bg-gray-300" />
      Closed
    </span>
  )
}

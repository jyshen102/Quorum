// Shared availability-row visual used in both the admin results view and
// the respondent-facing results view. Click handler is optional.

export type RowTier = 'empty' | 'voted' | 'runnerUp' | 'winner'

// Color tiers:
//   empty    — no votes, light gray
//   voted    — just one vote, soft green
//   runnerUp — multi-vote but not the max, amber/yellow
//   winner   — multi-vote AND tied with the highest count, blue
export function getTier(count: number, bestCount: number): RowTier {
  if (count === 0) return 'empty'
  if (count > 1 && count === bestCount) return 'winner'
  if (count > 1) return 'runnerUp'
  return 'voted'
}

export function HeatmapRow({
  label, count, total, ratio, tier, names, bestTime, onClick,
}: {
  label: string
  count: number
  total: number
  ratio: number
  tier: RowTier
  names: string[]
  bestTime?: string | null
  onClick?: () => void
}) {
  const bgByTier: Record<RowTier, string> = {
    empty: 'rgba(0,0,0,0.04)',
    voted: `rgba(5, 150, 105, ${0.12 + ratio * 0.35})`,
    runnerUp: `rgba(245, 158, 11, ${0.18 + ratio * 0.45})`,
    winner: `rgba(59, 130, 246, ${0.28 + ratio * 0.55})`,
  }

  const badge =
    tier === 'winner' ? { label: 'Best', cls: 'bg-blue-600 text-white' } :
    tier === 'runnerUp' ? { label: 'Maybe', cls: 'bg-amber-500 text-white' } :
    null

  const inner = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{label}</span>
          {badge && (
            <span className={`text-xs font-semibold ${badge.cls} px-2 py-0.5 rounded-full`}>
              {badge.label}
            </span>
          )}
          {names.length > 0 && (
            <span className="text-xs text-gray-500 truncate hidden sm:block">
              {names.slice(0, 4).join(', ')}{names.length > 4 ? ` +${names.length - 4}` : ''}
            </span>
          )}
        </div>
        <span className="text-sm font-bold text-gray-700 flex-shrink-0">
          {count}/{total}
        </span>
      </div>
      {names.length > 0 && (
        <p className="text-xs text-gray-600 mt-1 sm:hidden">
          {names.join(', ')}
        </p>
      )}
      {bestTime && (
        <p className="text-xs text-gray-600 mt-1">
          <span className="font-medium">Best time:</span> {bestTime}
        </p>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left rounded-xl px-4 py-3 transition-all hover:ring-2 hover:ring-gray-900/30 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        style={{ backgroundColor: bgByTier[tier] }}
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      className="rounded-xl px-4 py-3 transition-colors"
      style={{ backgroundColor: bgByTier[tier] }}
    >
      {inner}
    </div>
  )
}

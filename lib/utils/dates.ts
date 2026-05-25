export function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  const current = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')

  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  return dates
}

export interface WeekendBlock {
  label: string
  dates: string[] // [fri, sat, sun] — some may be outside range
  key: string    // YYYY-MM-DD of Saturday
}

export function getWeekendBlocks(start: string, end: string): WeekendBlock[] {
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')
  const blocks: WeekendBlock[] = []
  const seen = new Set<string>()

  const current = new Date(startDate)
  while (current <= endDate) {
    const dow = current.getDay() // 0=Sun,1=Mon,...,6=Sat
    // Find the Saturday of this week
    const sat = new Date(current)
    if (dow === 0) sat.setDate(sat.getDate() - 1) // Sun → prev Sat
    else if (dow === 6) { /* already Sat */ }
    else sat.setDate(sat.getDate() + (6 - dow))

    const satKey = sat.toISOString().split('T')[0]
    if (!seen.has(satKey)) {
      seen.add(satKey)

      const fri = new Date(sat)
      fri.setDate(sat.getDate() - 1)
      const sun = new Date(sat)
      sun.setDate(sat.getDate() + 1)

      const friKey = fri.toISOString().split('T')[0]
      const sunKey = sun.toISOString().split('T')[0]

      // Only include dates within range
      const blockDates = [friKey, satKey, sunKey].filter((d) => {
        return d >= start && d <= end
      })

      if (blockDates.length > 0) {
        const friLabel = fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const sunLabel = sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        blocks.push({
          label: `${friLabel} – ${sunLabel}`,
          dates: blockDates,
          key: satKey,
        })
      }
    }

    current.setDate(current.getDate() + 1)
  }

  return blocks
}

export function formatDateKey(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (s.getFullYear() !== e.getFullYear()) {
    return `${s.toLocaleDateString('en-US', { ...opts, year: 'numeric' })} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
  }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

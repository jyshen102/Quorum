// Parse loose time-slot strings into [startMin, endMin] minutes-from-midnight intervals.
// Examples handled:
//   "7pm"               → 19:00–19:30   (point times get a 30-min window)
//   "7:30pm"            → 19:30–20:00
//   "5-9pm" / "5pm-9pm" → 17:00–21:00
//   "11am-3pm"          → 11:00–15:00
//   "7:30-9:30"         → 19:30–21:30   (no-AM/PM ranges assumed PM for evening hours)
//   "after 5pm"         → 17:00–24:00
//   "before 9pm"        → 00:00–21:00
//   "Lunch (11am-3pm)"  → 11:00–15:00   (extracts text inside parens)
// Returns null if it can't make sense of the input.

const DAY_END = 24 * 60

function parseToken(raw: string): number | null {
  const t = raw.toLowerCase().trim().replace(/\s+/g, '')
  // Allow "noon"/"midnight" shortcuts
  if (t === 'noon') return 12 * 60
  if (t === 'midnight') return 0
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const period = m[3]
  if (min > 59) return null
  if (period === 'pm' && h < 12) h += 12
  else if (period === 'am' && h === 12) h = 0
  else if (!period) {
    // No AM/PM. Assume PM for 1–7 (most social events are evening),
    // 24-hour for 13–23, AM for 0/8–11.
    if (h >= 1 && h <= 7) h += 12
  }
  if (h > 23) return null
  return h * 60 + min
}

export interface TimeInterval {
  startMin: number
  endMin: number
}

export function parseTimeSlot(input: string): TimeInterval | null {
  if (!input) return null

  // Extract content inside parens if present: "Lunch (11am-3pm)" → "11am-3pm"
  const paren = input.match(/\(([^)]+)\)/)
  const target = (paren ? paren[1] : input).trim().toLowerCase()

  // "after Xpm"
  let m = target.match(/^after\s+(.+)$/)
  if (m) {
    const t = parseToken(m[1])
    return t == null ? null : { startMin: t, endMin: DAY_END }
  }

  // "before Xpm"
  m = target.match(/^before\s+(.+)$/)
  if (m) {
    const t = parseToken(m[1])
    return t == null ? null : { startMin: 0, endMin: t }
  }

  // Range: "X-Y", "X – Y", "X to Y"
  m = target.match(/^(.+?)\s*[-–—]\s*(.+)$/) || target.match(/^(.+?)\s+to\s+(.+)$/)
  if (m) {
    let leftStr = m[1].trim()
    const rightStr = m[2].trim()
    const leftHasPeriod = /am|pm/.test(leftStr)
    const rightHasPeriod = /am|pm/.test(rightStr)

    // If only the right side specifies AM/PM, infer left's period:
    //   - if left number > right number, left uses the opposite period
    //     (e.g. "11-3pm" → "11am-3pm")
    //   - else same period (e.g. "5-9pm" → "5pm-9pm")
    if (!leftHasPeriod && rightHasPeriod) {
      const rightPeriod = rightStr.match(/am|pm/)![0]
      const leftNumMatch = leftStr.match(/^(\d{1,2})/)
      const rightNumMatch = rightStr.match(/^(\d{1,2})/)
      const leftNum = leftNumMatch ? parseInt(leftNumMatch[1], 10) : 0
      const rightNum = rightNumMatch ? parseInt(rightNumMatch[1], 10) : 0
      const opposite = rightPeriod === 'pm' ? 'am' : 'pm'
      leftStr += leftNum > rightNum ? opposite : rightPeriod
    }

    const start = parseToken(leftStr)
    const end = parseToken(rightStr)
    if (start == null || end == null) return null
    // End-before-start (e.g. 11pm-2am) — push end past midnight
    const endAdj = end <= start ? end + 1440 : end
    return { startMin: start, endMin: endAdj }
  }

  // Single point time → 30 minute window centered on it (forward).
  const t = parseToken(target)
  if (t != null) return { startMin: t, endMin: Math.min(t + 30, DAY_END) }

  return null
}

// Given a list of time-slot strings (any number of respondents' picks for one date),
// find the contiguous time window with the most respondents simultaneously available.
// Returns null if no parseable times.
export function findBestTimeWindow(slotsByRespondent: string[][]): {
  startMin: number
  endMin: number
  count: number
} | null {
  // Per-respondent: their union of parseable intervals on this date
  const respondentIntervals: TimeInterval[][] = slotsByRespondent
    .map((slots) => slots.map(parseTimeSlot).filter((x): x is TimeInterval => x !== null))
    .filter((arr) => arr.length > 0)

  if (respondentIntervals.length === 0) return null

  // Sweep: at each minute boundary, increment when a respondent's interval starts,
  // decrement when it ends. But we want "how many respondents are available at minute m"
  // — that's the number of respondents whose union-of-intervals covers m.
  // Build per-minute coverage as a Set count per respondent.

  const totalMinutes = 24 * 60
  // For each respondent, mark which minutes they cover
  const covered: Uint8Array[] = respondentIntervals.map((intervals) => {
    const arr = new Uint8Array(totalMinutes)
    for (const { startMin, endMin } of intervals) {
      const s = Math.max(0, startMin)
      const e = Math.min(totalMinutes, endMin) // ignore past-midnight overflow for tally
      for (let i = s; i < e; i++) arr[i] = 1
    }
    return arr
  })

  // Sum across respondents
  const counts = new Uint16Array(totalMinutes)
  for (const arr of covered) {
    for (let i = 0; i < totalMinutes; i++) counts[i] += arr[i]
  }

  // Find peak count
  let peak = 0
  for (let i = 0; i < totalMinutes; i++) if (counts[i] > peak) peak = counts[i]
  if (peak === 0) return null

  // Find the longest contiguous run at the peak
  let bestStart = -1
  let bestLen = 0
  let curStart = -1
  for (let i = 0; i <= totalMinutes; i++) {
    if (i < totalMinutes && counts[i] === peak) {
      if (curStart === -1) curStart = i
    } else if (curStart !== -1) {
      const len = i - curStart
      if (len > bestLen) {
        bestLen = len
        bestStart = curStart
      }
      curStart = -1
    }
  }

  return { startMin: bestStart, endMin: bestStart + bestLen, count: peak }
}

export function formatMinutes(min: number): string {
  const h24 = Math.floor(min / 60) % 24
  const m = min % 60
  const period = h24 >= 12 ? 'pm' : 'am'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, '0')}${period}`
}

export function formatInterval(startMin: number, endMin: number): string {
  return `${formatMinutes(startMin)}–${formatMinutes(endMin)}`
}

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TypeBadge } from '@/components/TypeBadge'
import { StatusDot } from '@/components/StatusDot'
import { formatDateRange, formatDateKey } from '@/lib/utils/dates'
import type { Event } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: eventsRaw } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })

  const events = (eventsRaw ?? []) as Event[]

  const { data: respondentCountsRaw } = await supabase
    .from('respondents')
    .select('event_id')

  const respondentCounts = (respondentCountsRaw ?? []) as { event_id: string }[]

  const countMap: Record<string, number> = {}
  respondentCounts.forEach((r) => {
    countMap[r.event_id] = (countMap[r.event_id] || 0) + 1
  })

  const totalEvents = events.length
  const openPolls = events.filter((e) => e.status === 'open').length
  const totalResponses = Object.values(countMap).reduce((a, b) => a + b, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-gray-900">Quorum</h1>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/events/new"
              className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              + New event
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total events', value: totalEvents },
            { label: 'Open polls', value: openPolls },
            { label: 'Total responses', value: totalResponses },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Events list */}
        {events.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg font-medium">No events yet</p>
            <p className="text-sm mt-1">Create your first event to get started.</p>
            <Link
              href="/events/new"
              className="inline-block mt-4 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              + New event
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}/admin`}
                className="bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-200 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <TypeBadge type={event.type} />
                      {(() => {
                        const subs = event.subtypes?.length ? event.subtypes : event.subtype ? [event.subtype] : []
                        return subs.length > 0 ? (
                          <span className="text-xs text-gray-400">{subs.join(' or ')}</span>
                        ) : null
                      })()}
                      <StatusDot status={event.status} />
                    </div>
                    <h2 className="text-base font-semibold text-gray-900 truncate group-hover:text-gray-700">
                      {event.title}
                    </h2>
                    {event.description && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{event.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1.5">
                      {formatDateRange(event.date_range_start, event.date_range_end)}
                      {event.location && <> · 📍 {event.location}</>}
                    </p>
                    {event.status === 'closed' && event.final_date && (
                      <p className="text-xs text-emerald-700 font-medium mt-1">
                        ✓ Final: {formatDateKey(event.final_date)}
                        {event.final_time && <span className="font-normal"> · {event.final_time}</span>}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-bold text-gray-900">{countMap[event.id] ?? 0}</p>
                    <p className="text-xs text-gray-400">
                      {countMap[event.id] === 1 ? 'response' : 'responses'}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

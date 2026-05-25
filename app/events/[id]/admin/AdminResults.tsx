'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { TypeBadge } from '@/components/TypeBadge'
import { StatusDot } from '@/components/StatusDot'
import { getDatesInRange, getWeekendBlocks, formatDateKey, formatDateRange } from '@/lib/utils/dates'
import { findBestTimeWindow, formatInterval } from '@/lib/utils/timeParse'
import type { Event, Respondent, Response, CustomQuestion, EventType } from '@/lib/types/database'
import { SUBTYPES_BY_TYPE, TIME_SLOTS_BY_TYPE } from '@/lib/constants'
import { closePoll, reopenPoll, updateEvent, deleteEvent } from './actions'

interface Props {
  event: Event
  questions: CustomQuestion[]
  initialRespondents: Respondent[]
  initialResponses: Response[]
  shareUrl: string
}

export function AdminResults({ event, questions: _questions, initialRespondents, initialResponses, shareUrl }: Props) {
  const [respondents, setRespondents] = useState<Respondent[]>(initialRespondents)
  const [responses, setResponses] = useState<Response[]>(initialResponses)
  const [copied, setCopied] = useState(false)
  const [closingDate, setClosingDate] = useState('')
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [currentEvent, setCurrentEvent] = useState(event)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    title: event.title,
    subtypes: event.subtypes?.length ? event.subtypes : event.subtype ? [event.subtype] : [],
    location: event.location ?? '',
    description: event.description ?? '',
    time_slots: event.time_slots ?? [],
  })
  const [newSlotInput, setNewSlotInput] = useState('')

  // Realtime subscriptions
  useEffect(() => {
    if (currentEvent.status !== 'open') return
    const supabase = createClient()

    const channel = supabase
      .channel(`event-${event.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'respondents', filter: `event_id=eq.${event.id}` },
        (payload) => {
          setRespondents((prev) => [...prev, payload.new as Respondent])
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'responses' },
        async (payload) => {
          // Check if this response belongs to this event
          const newResponse = payload.new as Response
          setResponses((prev) => [...prev, newResponse])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [event.id, currentEvent.status])

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Build availability map: dateKey → respondent ids who are available
  const availabilityMap: Record<string, Set<string>> = {}
  // dateKey → array of (respondent's time-slot picks for that date)
  const timeSlotsByDate: Record<string, string[][]> = {}
  responses.forEach((r) => {
    if (!availabilityMap[r.date_key]) availabilityMap[r.date_key] = new Set()
    availabilityMap[r.date_key].add(r.respondent_id)
    if (!timeSlotsByDate[r.date_key]) timeSlotsByDate[r.date_key] = []
    timeSlotsByDate[r.date_key].push(r.time_slots ?? [])
  })

  // Build respondent name map
  const respondentMap: Record<string, string> = {}
  respondents.forEach((r) => { respondentMap[r.id] = r.name })

  const totalRespondents = respondents.length

  const isTrip = event.type === 'trip'
  const dateKeys = isTrip ? [] : getDatesInRange(event.date_range_start, event.date_range_end)
  const weekendBlocks = isTrip ? getWeekendBlocks(event.date_range_start, event.date_range_end) : []

  // Best overlap
  let bestCount = 0
  if (isTrip) {
    weekendBlocks.forEach((block) => {
      const ids = new Set<string>()
      block.dates.forEach((d) => { availabilityMap[d]?.forEach((id) => ids.add(id)) })
      if (ids.size > bestCount) bestCount = ids.size
    })
  } else {
    dateKeys.forEach((d) => {
      const count = availabilityMap[d]?.size ?? 0
      if (count > bestCount) bestCount = count
    })
  }

  // Dates with responses for the close form dropdown
  const datesWithResponses = isTrip
    ? weekendBlocks.filter((b) => b.dates.some((d) => availabilityMap[d]?.size)).map((b) => b.key)
    : dateKeys.filter((d) => (availabilityMap[d]?.size ?? 0) > 0)

  const handleClose = () => {
    if (!closingDate) return
    startTransition(async () => {
      await closePoll(event.id, closingDate)
      setCurrentEvent((e) => ({ ...e, status: 'closed', final_date: closingDate }))
      setShowCloseForm(false)
    })
  }

  const handleReopen = () => {
    startTransition(async () => {
      await reopenPoll(event.id)
      setCurrentEvent((e) => ({ ...e, status: 'open', final_date: null }))
    })
  }

  const handleSaveEdit = () => {
    setEditError(null)
    startTransition(async () => {
      try {
        await updateEvent(event.id, editForm)
        setCurrentEvent((e) => ({
          ...e,
          title: editForm.title.trim(),
          subtype: editForm.subtypes[0] ?? null,
          subtypes: editForm.subtypes,
          location: editForm.location.trim() || null,
          description: editForm.description.trim() || null,
          time_slots: editForm.time_slots,
        }))
        setEditing(false)
      } catch (e: any) {
        setEditError(e.message)
      }
    })
  }

  const handleCancelEdit = () => {
    setEditForm({
      title: currentEvent.title,
      subtypes: currentEvent.subtypes?.length ? currentEvent.subtypes : currentEvent.subtype ? [currentEvent.subtype] : [],
      location: currentEvent.location ?? '',
      description: currentEvent.description ?? '',
      time_slots: currentEvent.time_slots ?? [],
    })
    setNewSlotInput('')
    setEditError(null)
    setEditing(false)
  }

  const toggleEditSlot = (slot: string) => {
    setEditForm((f) => ({
      ...f,
      time_slots: f.time_slots.includes(slot)
        ? f.time_slots.filter((s) => s !== slot)
        : [...f.time_slots, slot],
    }))
  }

  const removeEditSlot = (slot: string) => {
    setEditForm((f) => ({ ...f, time_slots: f.time_slots.filter((s) => s !== slot) }))
  }

  const addNewSlot = () => {
    const v = newSlotInput.trim()
    if (!v) return
    if (editForm.time_slots.includes(v)) { setNewSlotInput(''); return }
    setEditForm((f) => ({ ...f, time_slots: [...f.time_slots, v] }))
    setNewSlotInput('')
  }

  const handleDelete = () => {
    startTransition(async () => {
      await deleteEvent(event.id)
      // redirect happens server-side
    })
  }

  const toggleEditSubtype = (sub: string) => {
    setEditForm((f) => ({
      ...f,
      subtypes: f.subtypes.includes(sub)
        ? f.subtypes.filter((s) => s !== sub)
        : [...f.subtypes, sub],
    }))
  }

  const editableSubtypeOptions = SUBTYPES_BY_TYPE[event.type as EventType]
  const slotSuggestions = TIME_SLOTS_BY_TYPE[event.type as EventType]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 text-sm">← Dashboard</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Event header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          {!editing ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <TypeBadge type={event.type as any} />
                    {(currentEvent.subtypes?.length ? currentEvent.subtypes : currentEvent.subtype ? [currentEvent.subtype] : []).length > 0 && (
                      <span className="text-xs text-gray-400">
                        {(currentEvent.subtypes?.length ? currentEvent.subtypes : currentEvent.subtype ? [currentEvent.subtype] : []).join(' or ')}
                      </span>
                    )}
                    <StatusDot status={currentEvent.status as any} />
                  </div>
                  <h1 className="text-xl font-bold text-gray-900">{currentEvent.title}</h1>
                  {currentEvent.description && <p className="text-sm text-gray-500 mt-1">{currentEvent.description}</p>}
                  <p className="text-xs text-gray-400 mt-2">
                    {formatDateRange(event.date_range_start, event.date_range_end)}
                    {currentEvent.location && <> · 📍 {currentEvent.location}</>}
                  </p>
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors hover:border-gray-400 flex-shrink-0"
                >
                  Edit
                </button>
              </div>

              {/* Final date banner */}
              {currentEvent.status === 'closed' && currentEvent.final_date && (
                <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="text-emerald-600 text-sm font-medium">
                    Final date: {formatDateKey(currentEvent.final_date)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-gray-800">Edit event</h2>
                <p className="text-xs text-gray-400">Date range and type can&apos;t be changed</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subtype</label>
                <div className="flex flex-wrap gap-2">
                  {editableSubtypeOptions.map((sub) => {
                    const sel = editForm.subtypes.includes(sub)
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => toggleEditSubtype(sub)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          sel
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'border-gray-200 text-gray-600 hover:border-gray-400'
                        }`}
                      >
                        {sub}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Joe's Pizza, my place, TBD"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Time slots</label>
                <p className="text-xs text-gray-400 mb-2">Tap to add/remove. Respondents can still add their own times.</p>

                {/* Current slots (removable chips) */}
                {editForm.time_slots.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {editForm.time_slots.map((slot) => (
                      <span
                        key={slot}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-900 text-white"
                      >
                        {slot}
                        <button
                          type="button"
                          onClick={() => removeEditSlot(slot)}
                          className="text-white/70 hover:text-white"
                          aria-label={`Remove ${slot}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Suggested slots not yet added */}
                {slotSuggestions.filter((s) => !editForm.time_slots.includes(s)).length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {slotSuggestions
                      .filter((s) => !editForm.time_slots.includes(s))
                      .map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => toggleEditSlot(slot)}
                          className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-800 transition-colors"
                        >
                          + {slot}
                        </button>
                      ))}
                  </div>
                )}

                {/* Custom slot input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSlotInput}
                    onChange={(e) => setNewSlotInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNewSlot() } }}
                    placeholder="Add custom slot (e.g. Brunch 11am-2pm)"
                    className="flex-1 min-w-0 border border-gray-200 rounded-full px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={addNewSlot}
                    disabled={!newSlotInput.trim()}
                    className="text-xs font-medium text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 hover:border-gray-400 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {editError && <p className="text-sm text-red-600">{editError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveEdit}
                  disabled={isPending || !editForm.title.trim()}
                  className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isPending}
                  className="text-sm text-gray-500 hover:text-gray-900 px-3 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats + shareable link */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalRespondents}</p>
                <p className="text-xs text-gray-400 mt-0.5">{totalRespondents === 1 ? 'Response' : 'Responses'}</p>
              </div>
              {totalRespondents > 0 && (
                <div>
                  <p className="text-2xl font-bold text-emerald-600">{bestCount}/{totalRespondents}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Best overlap</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs text-gray-400 mb-2">Shareable link</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5 flex-1 truncate">
                {shareUrl}
              </code>
              <button
                onClick={copyLink}
                className="text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Availability heatmap */}
        {totalRespondents > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Availability</h2>
            <div className="space-y-2">
              {isTrip
                ? weekendBlocks.map((block) => {
                    const ids = new Set<string>()
                    block.dates.forEach((d) => availabilityMap[d]?.forEach((id) => ids.add(id)))
                    const count = ids.size
                    const ratio = totalRespondents > 0 ? count / totalRespondents : 0
                    const tier = getTier(count, bestCount)
                    const names = Array.from(ids).map((id) => respondentMap[id]).filter(Boolean)
                    return (
                      <HeatmapRow
                        key={block.key}
                        label={block.label}
                        count={count}
                        total={totalRespondents}
                        ratio={ratio}
                        tier={tier}
                        names={names}
                      />
                    )
                  })
                : dateKeys.map((dateKey) => {
                    const ids = availabilityMap[dateKey] ?? new Set()
                    const count = ids.size
                    const ratio = totalRespondents > 0 ? count / totalRespondents : 0
                    const tier = getTier(count, bestCount)
                    const names = Array.from(ids).map((id) => respondentMap[id]).filter(Boolean)
                    const peak = count > 0 ? findBestTimeWindow(timeSlotsByDate[dateKey] ?? []) : null
                    const bestTimeText = peak
                      ? `${formatInterval(peak.startMin, peak.endMin)} (${peak.count}/${count})`
                      : null
                    return (
                      <HeatmapRow
                        key={dateKey}
                        label={formatDateKey(dateKey)}
                        count={count}
                        total={totalRespondents}
                        ratio={ratio}
                        tier={tier}
                        names={names}
                        bestTime={bestTimeText}
                      />
                    )
                  })}
            </div>
          </div>
        )}

        {/* Respondents */}
        {respondents.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Respondents</h2>
            <div className="flex flex-wrap gap-2">
              {respondents.map((r) => (
                <span
                  key={r.id}
                  className="bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full"
                >
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Close poll */}
        {currentEvent.status === 'open' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            {!showCloseForm ? (
              <button
                onClick={() => setShowCloseForm(true)}
                className="text-sm font-medium text-gray-600 border border-gray-200 rounded-lg px-4 py-2 hover:border-gray-400 hover:text-gray-900 transition-colors"
              >
                Close poll & set final date
              </button>
            ) : (
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-3">Set final date</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={closingDate}
                    onChange={(e) => setClosingDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Select a date…</option>
                    {datesWithResponses.map((d) => (
                      <option key={d} value={d}>{formatDateKey(d)}</option>
                    ))}
                    {/* Also allow custom date */}
                    <option value="custom">Enter custom date…</option>
                  </select>
                  {closingDate === 'custom' && (
                    <input
                      type="date"
                      onChange={(e) => setClosingDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  )}
                  <button
                    onClick={handleClose}
                    disabled={!closingDate || closingDate === 'custom' || isPending}
                    className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPending ? 'Closing…' : 'Confirm & close'}
                  </button>
                  <button
                    onClick={() => setShowCloseForm(false)}
                    className="text-sm text-gray-400 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reopen poll */}
        {currentEvent.status === 'closed' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <button
              onClick={handleReopen}
              disabled={isPending}
              className="text-sm font-medium text-gray-600 border border-gray-200 rounded-lg px-4 py-2 hover:border-gray-400 hover:text-gray-900 disabled:opacity-40 transition-colors"
            >
              {isPending ? 'Reopening…' : 'Reopen poll'}
            </button>
          </div>
        )}

        {/* Danger zone — delete */}
        <div className="bg-white rounded-2xl border border-red-100 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-2">Danger zone</p>
          {!confirmingDelete ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-gray-600">
                Delete this event and all <strong>{respondents.length}</strong> {respondents.length === 1 ? 'response' : 'responses'}. This cannot be undone.
              </p>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="text-sm font-medium text-red-600 border border-red-200 rounded-lg px-4 py-2 hover:bg-red-50 transition-colors flex-shrink-0"
              >
                Delete event
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-800 font-medium mb-3">
                Are you sure? This will permanently delete &ldquo;{currentEvent.title}&rdquo; and all responses.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isPending ? 'Deleting…' : 'Yes, delete forever'}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={isPending}
                  className="text-sm text-gray-500 hover:text-gray-900 px-3 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

type RowTier = 'empty' | 'voted' | 'runnerUp' | 'winner'

// Color tiers:
//   empty    — no votes, light gray
//   voted    — just one vote, soft green
//   runnerUp — multi-vote but not the max, amber/yellow
//   winner   — multi-vote AND tied with the highest count, blue
function getTier(count: number, bestCount: number): RowTier {
  if (count === 0) return 'empty'
  if (count > 1 && count === bestCount) return 'winner'
  if (count > 1) return 'runnerUp'
  return 'voted'
}

function HeatmapRow({
  label, count, total, ratio, tier, names, bestTime
}: {
  label: string
  count: number
  total: number
  ratio: number
  tier: RowTier
  names: string[]
  bestTime?: string | null
}) {
  // Background color per tier, with ratio-based intensity
  const bgByTier: Record<RowTier, string> = {
    empty: 'rgba(0,0,0,0.04)',
    voted: `rgba(5, 150, 105, ${0.12 + ratio * 0.35})`,   // green
    runnerUp: `rgba(245, 158, 11, ${0.18 + ratio * 0.45})`, // amber
    winner: `rgba(59, 130, 246, ${0.28 + ratio * 0.55})`,  // blue
  }

  const badge =
    tier === 'winner' ? { label: 'Best', cls: 'bg-blue-600 text-white' } :
    tier === 'runnerUp' ? { label: 'Maybe', cls: 'bg-amber-500 text-white' } :
    null

  return (
    <div
      className="rounded-xl px-4 py-3 transition-colors"
      style={{ backgroundColor: bgByTier[tier] }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
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
      {bestTime && (
        <p className="text-xs text-gray-600 mt-1">
          <span className="font-medium">Best time:</span> {bestTime}
        </p>
      )}
    </div>
  )
}

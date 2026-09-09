'use client'

import { useState, useEffect, useTransition } from 'react'
import { TypeBadge } from '@/components/TypeBadge'
import { HeatmapRow, getTier } from '@/components/HeatmapRow'
import { createClient } from '@/lib/supabase/client'
import { getDatesInRange, getWeekendBlocks, formatDateKey, formatDateRange } from '@/lib/utils/dates'
import { findBestTimeWindow, formatInterval } from '@/lib/utils/timeParse'
import type { Event, CustomQuestion, Respondent, Response } from '@/lib/types/database'
import { submitResponse, updateResponse, getMyResponse } from './actions'

interface Props {
  event: Event
  questions: CustomQuestion[]
  initialRespondents: Respondent[]
  initialResponses: Response[]
}

type Step = 'name' | 'availability' | 'done' | 'results'

const respondedKey = (eventId: string) => `quorum:responded:${eventId}`

export function RespondentView({ event, questions, initialRespondents, initialResponses }: Props) {
  const [step, setStep] = useState<Step>('name')
  const [respondents, setRespondents] = useState<Respondent[]>(initialRespondents)
  const [responses, setResponses] = useState<Response[]>(initialResponses)
  const [name, setName] = useState('')
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [dateSelections, setDateSelections] = useState<Record<string, string[]>>({})
  // For trip: selected weekend block keys (Saturday key)
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set())
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({})
  // Per-date structured time picker state for "add your own"
  type PickerMode = 'after' | 'between'
  type PickerState = {
    mode: PickerMode
    hour: number; minute: number; period: 'am' | 'pm'
    endHour: number; endMinute: number; endPeriod: 'am' | 'pm'
  }
  const defaultPicker = (): PickerState => ({
    mode: 'after',
    hour: 5, minute: 0, period: 'pm',
    endHour: 9, endMinute: 0, endPeriod: 'pm',
  })
  const [timePickers, setTimePickers] = useState<Record<string, PickerState>>({})
  const getPicker = (dk: string): PickerState => timePickers[dk] ?? defaultPicker()
  const setPicker = (dk: string, patch: Partial<PickerState>) =>
    setTimePickers((prev) => ({ ...prev, [dk]: { ...getPicker(dk), ...patch } }))
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(event.date_range_start + 'T00:00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // When set, the form is editing this existing respondent's submission
  // (rather than creating a fresh one). null = new submission.
  const [editingRespondentId, setEditingRespondentId] = useState<string | null>(null)
  // Which per-date time pickers are currently expanded (collapsed = just show
  // an "Add my own time" trigger; expanded = show the mode + time controls)
  const [expandedPicker, setExpandedPicker] = useState<Record<string, boolean>>({})

  // If this device already submitted for this event, jump straight to results.
  useEffect(() => {
    if (event.status === 'closed') return
    if (typeof window === 'undefined') return
    const respondentId = window.localStorage.getItem(respondedKey(event.id))
    if (respondentId) setStep('results')
  }, [event.id, event.status])

  // Live-update the results view as new responses come in
  useEffect(() => {
    if (step !== 'results' && step !== 'done') return
    const supabase = createClient()
    const channel = supabase
      .channel(`r-event-${event.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'respondents', filter: `event_id=eq.${event.id}` },
        (payload) => setRespondents((prev) => [...prev, payload.new as Respondent]))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'responses' },
        (payload) => setResponses((prev) => [...prev, payload.new as Response]))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [step, event.id])

  const isTrip = event.type === 'trip'
  const weekendBlocks = isTrip ? getWeekendBlocks(event.date_range_start, event.date_range_end) : []

  // Poll closed
  if (event.status === 'closed') {
    return (
      <ClosedView event={event} />
    )
  }

  const toggleDate = (dateKey: string) => {
    const next = new Set(selectedDates)
    if (next.has(dateKey)) {
      next.delete(dateKey)
      const nextSels = { ...dateSelections }
      delete nextSels[dateKey]
      setDateSelections(nextSels)
    } else {
      next.add(dateKey)
    }
    setSelectedDates(next)
  }

  const toggleBlock = (blockKey: string) => {
    const next = new Set(selectedBlocks)
    if (next.has(blockKey)) next.delete(blockKey)
    else next.add(blockKey)
    setSelectedBlocks(next)
  }

  const toggleTimeSlot = (dateKey: string, slot: string) => {
    const current = dateSelections[dateKey] ?? []
    const next = current.includes(slot)
      ? current.filter((s) => s !== slot)
      : [...current, slot]
    setDateSelections((prev) => ({ ...prev, [dateKey]: next }))
  }

  const addCustomTime = (dateKey: string) => {
    const p = getPicker(dateKey)
    const fmt = (h: number, m: number, period: 'am' | 'pm') => {
      const minStr = m === 0 ? '' : `:${m.toString().padStart(2, '0')}`
      return `${h}${minStr}${period}`
    }
    const start = fmt(p.hour, p.minute, p.period)
    let slot: string
    if (p.mode === 'between') {
      const end = fmt(p.endHour, p.endMinute, p.endPeriod)
      slot = `${start}-${end}`
    } else {
      slot = `After ${start}`
    }

    const current = dateSelections[dateKey] ?? []
    if (current.includes(slot)) return // dedupe
    setDateSelections((prev) => ({ ...prev, [dateKey]: [...current, slot] }))
  }

  const removeTime = (dateKey: string, slot: string) => {
    setDateSelections((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] ?? []).filter((s) => s !== slot),
    }))
  }

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      try {
        let dateSelectionsArr: Array<{ dateKey: string; timeSlots: string[] }> = []

        if (isTrip) {
          weekendBlocks
            .filter((b) => selectedBlocks.has(b.key))
            .forEach((block) => {
              block.dates.forEach((d) => {
                dateSelectionsArr.push({ dateKey: d, timeSlots: [] })
              })
            })
        } else {
          dateSelectionsArr = Array.from(selectedDates).map((dk) => ({
            dateKey: dk,
            timeSlots: dateSelections[dk] ?? [],
          }))
        }

        const customAnswersArr = questions.map((q) => ({
          questionId: q.id,
          answerText: customAnswers[q.id] ?? '',
        }))

        const payload = {
          eventId: event.id,
          name,
          dateSelections: dateSelectionsArr,
          customAnswers: customAnswersArr,
        }
        const result = editingRespondentId
          ? await updateResponse(editingRespondentId, payload)
          : await submitResponse(payload)
        // Remember this device responded so revisits jump straight to results
        if (typeof window !== 'undefined' && result.respondentId) {
          window.localStorage.setItem(respondedKey(event.id), result.respondentId)
        }
        setEditingRespondentId(null)
        setStep('done')
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  // Load this respondent's prior submission into the form and switch to
  // edit mode. Called from the ResultsBlock "Edit my response" button.
  const startEditing = (respondentId: string) => {
    setError(null)
    startTransition(async () => {
      try {
        const data = await getMyResponse(respondentId)
        if (!data.found || data.eventId !== event.id) {
          // Respondent doesn't exist (probably deleted). Clear the stash and
          // fall back to a fresh form.
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(respondedKey(event.id))
          }
          setEditingRespondentId(null)
          setStep('name')
          return
        }

        // Pre-fill form state from the existing submission
        setName(data.name ?? '')

        const sels: Record<string, string[]> = {}
        const dateSet = new Set<string>()
        const blockSet = new Set<string>()
        ;(data.dateSelections ?? []).forEach((ds) => {
          dateSet.add(ds.dateKey)
          sels[ds.dateKey] = ds.timeSlots
        })
        setSelectedDates(dateSet)
        setDateSelections(sels)
        // For trip events, derive selected blocks from selected dates
        if (isTrip) {
          weekendBlocks.forEach((b) => {
            if (b.dates.some((d) => dateSet.has(d))) blockSet.add(b.key)
          })
          setSelectedBlocks(blockSet)
        }

        const answers: Record<string, string> = {}
        ;(data.customAnswers ?? []).forEach((a) => { answers[a.questionId] = a.answerText })
        setCustomAnswers(answers)

        setEditingRespondentId(respondentId)
        setStep('availability') // skip the name step; name is loaded already
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  // Done confirmation + results
  if (step === 'done' || step === 'results') {
    return (
      <Shell event={event}>
        <ResultsBlock
          event={event}
          respondents={respondents}
          responses={responses}
          headerVariant={step === 'done' ? 'just-submitted' : 'revisit'}
          onEdit={startEditing}
          editDisabled={isPending}
        />
      </Shell>
    )
  }

  // Step 1: Name
  if (step === 'name') {
    return (
      <Shell event={event}>
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">What&apos;s your name?</h2>
            <p className="text-sm text-gray-500">So the organizer knows who responded.</p>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) setStep('availability') }}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          <button
            onClick={() => setStep('availability')}
            disabled={!name.trim()}
            className="w-full bg-gray-900 text-white font-medium py-3 rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continue →
          </button>
        </div>
      </Shell>
    )
  }

  // Step 2: Availability
  const sortedSelectedDates = Array.from(selectedDates).sort()
  const hasSelection = isTrip ? selectedBlocks.size > 0 : selectedDates.size > 0

  return (
    <Shell event={event}>
      <div className="space-y-6">
        {editingRespondentId && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">Editing your response</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your previous picks are pre-filled below. Save when you&apos;re happy with the changes.
            </p>
          </div>
        )}
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {editingRespondentId ? 'Update your availability' : 'When can you make it?'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Select all dates that work for you.</p>
        </div>

        {isTrip ? (
          <TripPicker
            blocks={weekendBlocks}
            selected={selectedBlocks}
            onToggle={toggleBlock}
          />
        ) : (
          <CalendarPicker
            rangeStart={event.date_range_start}
            rangeEnd={event.date_range_end}
            selectedDates={selectedDates}
            calMonth={calMonth}
            onMonthChange={setCalMonth}
            onToggle={toggleDate}
          />
        )}

        {/* Selected-dates summary (calendar view only — TripPicker buttons
            already make selection visible). Removable chips. */}
        {!isTrip && sortedSelectedDates.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Your dates ({sortedSelectedDates.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {sortedSelectedDates.map((dk) => (
                <span
                  key={dk}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-600 text-white"
                >
                  {formatDateKey(dk)}
                  <button
                    type="button"
                    onClick={() => toggleDate(dk)}
                    className="text-white/80 hover:text-white"
                    aria-label={`Remove ${formatDateKey(dk)}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Time slot confirmation — only when the organizer defined time slots */}
        {!isTrip && sortedSelectedDates.length > 0 && event.time_slots.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-700">
              Which times work for each date?
              <span className="text-gray-400 font-normal ml-1">(select all that apply or add your own)</span>
            </p>
            {sortedSelectedDates.map((dk) => {
              const selected = dateSelections[dk] ?? []
              const customExtras = selected.filter((s) => !event.time_slots.includes(s))
              return (
                <div key={dk} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">{formatDateKey(dk)}</p>

                  {/* Predefined event slots */}
                  {event.time_slots.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {event.time_slots.map((slot) => {
                        const sel = selected.includes(slot)
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => toggleTimeSlot(dk, slot)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              sel
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'border-gray-200 text-gray-600 hover:border-gray-400'
                            }`}
                          >
                            {slot}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Custom times the user has added (as removable chips) */}
                  {customExtras.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {customExtras.map((slot) => (
                        <span
                          key={slot}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-600 text-white"
                        >
                          {slot}
                          <button
                            type="button"
                            onClick={() => removeTime(dk, slot)}
                            className="text-white/80 hover:text-white"
                            aria-label={`Remove ${slot}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Custom time — collapsed trigger, expands to a picker */}
                  {expandedPicker[dk] ? (
                    <TimePicker
                      state={getPicker(dk)}
                      onChange={(patch) => setPicker(dk, patch)}
                      onAdd={() => addCustomTime(dk)}
                      onClose={() => setExpandedPicker((p) => ({ ...p, [dk]: false }))}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedPicker((p) => ({ ...p, [dk]: true }))}
                      className="text-xs font-medium text-gray-600 border border-dashed border-gray-300 rounded-full px-3 py-1.5 hover:border-gray-500 hover:text-gray-900 transition-colors mt-1"
                    >
                      + Add my own time
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Custom questions */}
        {questions.length > 0 && hasSelection && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            {questions.map((q) => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{q.question_text}</label>
                <input
                  type="text"
                  value={customAnswers[q.id] ?? ''}
                  onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setStep('name')}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={!hasSelection || isPending}
            className="flex-1 bg-gray-900 text-white font-medium py-3 rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isPending
              ? (editingRespondentId ? 'Saving…' : 'Submitting…')
              : (editingRespondentId ? 'Save changes' : 'Submit')}
          </button>
        </div>
      </div>
    </Shell>
  )
}

function Shell({ event, children }: { event: Event; children: React.ReactNode }) {
  const subtypeList = event.subtypes?.length ? event.subtypes : event.subtype ? [event.subtype] : []
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <TypeBadge type={event.type as any} />
            {subtypeList.length > 0 && <span className="text-xs text-gray-400">{subtypeList.join(' or ')}</span>}
          </div>
          <h1 className="text-lg font-bold text-gray-900">{event.title}</h1>
          {event.description && <p className="text-sm text-gray-500 mt-0.5">{event.description}</p>}
          <p className="text-xs text-gray-400 mt-1">
            {formatDateRange(event.date_range_start, event.date_range_end)}
            {event.location && <> · 📍 {event.location}</>}
          </p>
        </div>
      </div>
      <div className="flex-1 max-w-lg w-full mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  )
}

function ClosedView({ event }: { event: Event }) {
  return (
    <Shell event={event}>
      <div className="text-center py-10 space-y-3">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-gray-500 text-lg">🔒</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">This poll is closed</h2>
        {event.final_date && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 inline-block">
            <p className="text-sm text-emerald-700">
              <span className="font-semibold">Final date:</span> {formatDateKey(event.final_date)}
            </p>
            {event.final_time && (
              <p className="text-sm text-emerald-700 mt-0.5">
                <span className="font-semibold">Time:</span> {event.final_time}
              </p>
            )}
          </div>
        )}
        {!event.final_date && (
          <p className="text-sm text-gray-500">The organizer will announce the final date soon.</p>
        )}
      </div>
    </Shell>
  )
}

function TripPicker({
  blocks,
  selected,
  onToggle,
}: {
  blocks: ReturnType<typeof getWeekendBlocks>
  selected: Set<string>
  onToggle: (key: string) => void
}) {
  if (blocks.length === 0) return <p className="text-sm text-gray-400">No weekends in selected range.</p>
  return (
    <div className="space-y-2">
      {blocks.map((block) => {
        const isSel = selected.has(block.key)
        return (
          <button
            key={block.key}
            type="button"
            onClick={() => onToggle(block.key)}
            className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all ${
              isSel
                ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <span className={`text-sm font-medium ${isSel ? 'text-emerald-700' : 'text-gray-800'}`}>
              {block.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function CalendarPicker({
  rangeStart,
  rangeEnd,
  selectedDates,
  calMonth,
  onMonthChange,
  onToggle,
}: {
  rangeStart: string
  rangeEnd: string
  selectedDates: Set<string>
  calMonth: { year: number; month: number }
  onMonthChange: (m: { year: number; month: number }) => void
  onToggle: (key: string) => void
}) {
  const { year, month } = calMonth

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => {
    if (month === 0) onMonthChange({ year: year - 1, month: 11 })
    else onMonthChange({ year, month: month - 1 })
  }
  const nextMonth = () => {
    if (month === 11) onMonthChange({ year: year + 1, month: 0 })
    else onMonthChange({ year, month: month + 1 })
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const cells: (string | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push(key)
  }

  const isInRange = (key: string) => key >= rangeStart && key <= rangeEnd

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg transition-colors">
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
        <button onClick={nextMonth} className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg transition-colors">
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((key, i) => {
          if (!key) return <div key={`empty-${i}`} />

          const inRange = isInRange(key)
          const selected = selectedDates.has(key)
          const day = parseInt(key.split('-')[2])

          return (
            <button
              key={key}
              type="button"
              disabled={!inRange}
              onClick={() => inRange && onToggle(key)}
              className={`aspect-square rounded-lg text-sm font-medium transition-all flex items-center justify-center ${
                selected
                  ? 'bg-emerald-600 text-white'
                  : inRange
                    ? 'hover:bg-gray-100 text-gray-800'
                    : 'text-gray-200 cursor-not-allowed'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type PickerMode = 'after' | 'between'
type PickerStateOuter = {
  mode: PickerMode
  hour: number; minute: number; period: 'am' | 'pm'
  endHour: number; endMinute: number; endPeriod: 'am' | 'pm'
}

function TimePicker({
  state,
  onChange,
  onAdd,
  onClose,
}: {
  state: PickerStateOuter
  onChange: (patch: Partial<PickerStateOuter>) => void
  onAdd: () => void
  onClose?: () => void
}) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 1) // 1..12
  const minutes = [0, 15, 30, 45]
  const selectClass =
    'border border-gray-200 bg-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

  return (
    <div className="mt-1 rounded-xl border border-gray-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Mode dropdown */}
        <select
          value={state.mode}
          onChange={(e) => onChange({ mode: e.target.value as PickerMode })}
          className={selectClass}
          aria-label="Time mode"
        >
          <option value="after">After</option>
          <option value="between">Between</option>
        </select>

        {/* Start time */}
        <select
          value={state.hour}
          onChange={(e) => onChange({ hour: parseInt(e.target.value, 10) })}
          className={selectClass}
          aria-label="Hour"
        >
          {hours.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <select
          value={state.minute}
          onChange={(e) => onChange({ minute: parseInt(e.target.value, 10) })}
          className={selectClass}
          aria-label="Minute"
        >
          {minutes.map((m) => <option key={m} value={m}>:{m.toString().padStart(2, '0')}</option>)}
        </select>
        <select
          value={state.period}
          onChange={(e) => onChange({ period: e.target.value as 'am' | 'pm' })}
          className={selectClass}
          aria-label="AM or PM"
        >
          <option value="am">AM</option>
          <option value="pm">PM</option>
        </select>

        {state.mode === 'between' && (
          <>
            <span className="text-xs text-gray-400">to</span>
            <select
              value={state.endHour}
              onChange={(e) => onChange({ endHour: parseInt(e.target.value, 10) })}
              className={selectClass}
              aria-label="End hour"
            >
              {hours.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <select
              value={state.endMinute}
              onChange={(e) => onChange({ endMinute: parseInt(e.target.value, 10) })}
              className={selectClass}
              aria-label="End minute"
            >
              {minutes.map((m) => <option key={m} value={m}>:{m.toString().padStart(2, '0')}</option>)}
            </select>
            <select
              value={state.endPeriod}
              onChange={(e) => onChange({ endPeriod: e.target.value as 'am' | 'pm' })}
              className={selectClass}
              aria-label="End AM or PM"
            >
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
          </>
        )}

        <button
          type="button"
          onClick={onAdd}
          className="text-xs font-semibold bg-gray-900 text-white rounded-full px-3 py-1.5 hover:bg-gray-800 transition-colors"
        >
          Add
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 transition-colors ml-auto"
            aria-label="Close time picker"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

// Compact, read-only results view rendered to respondents after they submit
// or when they revisit the link from the same device.
function ResultsBlock({
  event,
  respondents,
  responses,
  headerVariant,
  onEdit,
  editDisabled,
}: {
  event: Event
  respondents: Respondent[]
  responses: Response[]
  headerVariant: 'just-submitted' | 'revisit'
  onEdit: (respondentId: string) => void
  editDisabled: boolean
}) {
  const isTrip = event.type === 'trip'
  const dateKeys = isTrip ? [] : getDatesInRange(event.date_range_start, event.date_range_end)
  const weekendBlocks = isTrip ? getWeekendBlocks(event.date_range_start, event.date_range_end) : []

  const totalRespondents = respondents.length

  // dateKey → set of respondent ids
  const availabilityMap: Record<string, Set<string>> = {}
  // dateKey → array of (each respondent's time picks)
  const timeSlotsByDate: Record<string, string[][]> = {}
  responses.forEach((r) => {
    if (!availabilityMap[r.date_key]) availabilityMap[r.date_key] = new Set()
    availabilityMap[r.date_key].add(r.respondent_id)
    if (!timeSlotsByDate[r.date_key]) timeSlotsByDate[r.date_key] = []
    timeSlotsByDate[r.date_key].push(r.time_slots ?? [])
  })

  const respondentMap: Record<string, string> = {}
  respondents.forEach((r) => { respondentMap[r.id] = r.name })

  // Best overall count (across all dates / weekend blocks)
  let bestCount = 0
  if (isTrip) {
    weekendBlocks.forEach((block) => {
      const ids = new Set<string>()
      block.dates.forEach((d) => availabilityMap[d]?.forEach((id) => ids.add(id)))
      if (ids.size > bestCount) bestCount = ids.size
    })
  } else {
    dateKeys.forEach((d) => {
      const c = availabilityMap[d]?.size ?? 0
      if (c > bestCount) bestCount = c
    })
  }

  // Resolve the local respondent_id from localStorage (set on submit).
  // We resolve it lazily in the click handler so SSR stays clean.
  const handleEditClick = () => {
    if (typeof window === 'undefined') return
    const respondentId = window.localStorage.getItem(respondedKey(event.id))
    if (!respondentId) {
      // Edge case: localStorage was cleared between revisit and click.
      window.location.reload()
      return
    }
    onEdit(respondentId)
  }

  // Fully clear this device's link to the existing response and start over.
  const startFreshResponse = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(respondedKey(event.id))
      window.location.reload()
    }
  }

  // Pull the current respondent's name (if we have an id stashed) so the UI
  // can confirm whose response would be edited — avoids confusion on shared
  // devices.
  let myName: string | null = null
  if (typeof window !== 'undefined') {
    const respondentId = window.localStorage.getItem(respondedKey(event.id))
    if (respondentId) {
      const me = respondents.find((r) => r.id === respondentId)
      if (me) myName = me.name
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-xl">✓</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">
          {headerVariant === 'just-submitted' ? "You're in!" : "You've already responded"}
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          {totalRespondents === 1
            ? "You're the first to vote. Share the link to gather more responses."
            : `${totalRespondents} ${totalRespondents === 1 ? 'person has' : 'people have'} responded so far.`}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Group availability
        </p>
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
        <p className="text-xs text-gray-400 mt-3">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1 align-middle" /> Best —{' '}
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1 align-middle" /> Maybe —{' '}
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 align-middle" /> Voted —{' '}
          updates live as people respond.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2 pt-1">
        {myName && (
          <p className="text-xs text-gray-400">Submitted as <span className="font-medium text-gray-600">{myName}</span></p>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleEditClick}
            disabled={editDisabled}
            className="text-xs font-medium text-gray-700 border border-gray-200 rounded-full px-4 py-1.5 hover:border-gray-400 hover:text-gray-900 disabled:opacity-40 transition-colors"
          >
            {editDisabled ? 'Loading…' : 'Edit my response'}
          </button>
          {myName && (
            <button
              onClick={startFreshResponse}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Not you? Start over
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

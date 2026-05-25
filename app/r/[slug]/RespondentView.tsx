'use client'

import { useState, useTransition } from 'react'
import { TypeBadge } from '@/components/TypeBadge'
import { getWeekendBlocks, formatDateKey, formatDateRange } from '@/lib/utils/dates'
import type { Event, CustomQuestion } from '@/lib/types/database'
import { submitResponse } from './actions'

interface Props {
  event: Event
  questions: CustomQuestion[]
}

type Step = 'name' | 'availability' | 'done'

export function RespondentView({ event, questions }: Props) {
  const [step, setStep] = useState<Step>('name')
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

        await submitResponse({
          eventId: event.id,
          name,
          dateSelections: dateSelectionsArr,
          customAnswers: customAnswersArr,
        })
        setStep('done')
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  // Done confirmation
  if (step === 'done') {
    return (
      <Shell event={event}>
        <div className="text-center py-10">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">You&apos;re in!</h2>
          <p className="text-gray-500 text-sm mt-2">Your availability has been recorded.</p>
        </div>
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
        <div>
          <h2 className="text-base font-semibold text-gray-900">When can you make it?</h2>
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

        {/* Time slot confirmation for meal/hangout */}
        {!isTrip && sortedSelectedDates.length > 0 && (
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

                  {/* Custom time picker */}
                  <TimePicker
                    state={getPicker(dk)}
                    onChange={(patch) => setPicker(dk, patch)}
                    onAdd={() => addCustomTime(dk)}
                  />
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
            {isPending ? 'Submitting…' : 'Submit'}
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
}: {
  state: PickerStateOuter
  onChange: (patch: Partial<PickerStateOuter>) => void
  onAdd: () => void
}) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 1) // 1..12
  const minutes = [0, 15, 30, 45]
  const selectClass =
    'border border-gray-200 bg-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'
  const modes: { value: PickerMode; label: string }[] = [
    { value: 'after', label: 'After' },
    { value: 'between', label: 'Between' },
  ]

  return (
    <div className="space-y-2 mt-1">
      {/* Mode selector — small segmented control */}
      <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5 text-xs">
        {modes.map((m) => {
          const sel = state.mode === m.value
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange({ mode: m.value })}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                sel ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Start time + (end time when between) + add */}
      <div className="flex flex-wrap items-center gap-2">
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
          className="text-xs font-medium text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 hover:border-gray-400 hover:text-gray-900 transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  )
}

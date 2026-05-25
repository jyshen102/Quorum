'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { SUBTYPES_BY_TYPE, TIME_SLOTS_BY_TYPE, TYPE_LABELS } from '@/lib/constants'
import { createEvent, type EventFormData } from './actions'
import { formatDateRange } from '@/lib/utils/dates'
import type { EventType } from '@/lib/types/database'

const STEPS = ['Details', 'Dates & times', 'Questions']

const TYPE_OPTIONS: { value: EventType; label: string; description: string }[] = [
  { value: 'meal', label: 'Meal', description: 'Breakfast, brunch, lunch, dinner…' },
  { value: 'hangout', label: 'Hangout', description: 'Game night, movies, activities…' },
  { value: 'trip', label: 'Trip / Vacation', description: 'Weekend getaway, travel…' },
]

export function NewEventWizard() {
  const [step, setStep] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<EventFormData>({
    title: '',
    type: '',
    subtypes: [],
    location: '',
    description: '',
    date_range_start: '',
    date_range_end: '',
    time_slots: [],
    questions: [],
  })

  const update = <K extends keyof EventFormData>(field: K, value: EventFormData[K]) =>
    setForm((f) => ({ ...f, [field]: value }))

  const setType = (t: EventType) => {
    // Changing type clears subtypes + time slots (different options per type)
    setForm((f) => ({ ...f, type: t, subtypes: [], time_slots: [] }))
  }

  const toggleSubtype = (sub: string) => {
    update(
      'subtypes',
      form.subtypes.includes(sub)
        ? form.subtypes.filter((s) => s !== sub)
        : [...form.subtypes, sub]
    )
  }

  const toggleTimeSlot = (slot: string) => {
    update(
      'time_slots',
      form.time_slots.includes(slot)
        ? form.time_slots.filter((s) => s !== slot)
        : [...form.time_slots, slot]
    )
  }

  const canProceed = () => {
    if (step === 0) return form.title.trim() && form.type
    if (step === 1) return form.date_range_start && form.date_range_end
    return true
  }

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      try {
        await createEvent(form)
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  const availableSlots = form.type
    ? TIME_SLOTS_BY_TYPE[form.type as EventType]
    : []
  const availableSubtypes = form.type
    ? SUBTYPES_BY_TYPE[form.type as EventType]
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 text-sm">← Dashboard</Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-700">New event</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${
                i < step ? 'bg-gray-900 text-white' :
                i === step ? 'bg-gray-900 text-white' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${i === step ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-200 ml-1" />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
          {/* Step 1: Details */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Event name</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="e.g. Summer dinner party"
                  className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <div className="grid grid-cols-3 gap-3">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={`border rounded-xl p-3.5 text-left transition-all ${
                        form.type === opt.value
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className={`text-xs mt-0.5 ${form.type === opt.value ? 'text-gray-300' : 'text-gray-400'}`}>
                        {opt.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {form.type && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subtype <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <p className="text-xs text-gray-400 mb-2">Select one or more.</p>
                  <div className="flex flex-wrap gap-2">
                    {availableSubtypes.map((sub) => {
                      const selected = form.subtypes.includes(sub)
                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => toggleSubtype(sub)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            selected
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
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Location <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => update('location', e.target.value)}
                  placeholder="e.g. Joe's Pizza, my place, TBD"
                  className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Any details for your respondents…"
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 2: Dates & Times */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">From</label>
                  <input
                    type="date"
                    value={form.date_range_start}
                    onChange={(e) => update('date_range_start', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">To</label>
                  <input
                    type="date"
                    value={form.date_range_end}
                    min={form.date_range_start}
                    onChange={(e) => update('date_range_end', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.type === 'trip' ? 'Stay options' : 'Time slots'}
                  <span className="text-gray-400 font-normal ml-1">(optional)</span>
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  {form.type === 'trip'
                    ? 'Skip to just collect dates.'
                    : 'Leave blank if you just want to agree on a date and figure out the time later.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => toggleTimeSlot(slot)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.time_slots.includes(slot)
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'border-gray-200 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Questions + Summary */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Custom questions <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <p className="text-xs text-gray-400 mb-3">Ask respondents anything after they pick dates.</p>
                {form.questions.map((q, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => {
                        const next = [...form.questions]
                        next[i] = e.target.value
                        update('questions', next)
                      }}
                      placeholder={`Question ${i + 1}`}
                      className="flex-1 border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => update('questions', form.questions.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500 transition-colors px-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => update('questions', [...form.questions, ''])}
                  className="text-sm text-gray-500 hover:text-gray-900 border border-dashed border-gray-200 rounded-lg px-4 py-2 w-full transition-colors hover:border-gray-400 mt-1"
                >
                  + Add question
                </button>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2 border border-gray-100">
                <p className="font-semibold text-gray-900 mb-3">Summary</p>
                <SummaryRow label="Name" value={form.title} />
                <SummaryRow
                  label="Type"
                  value={`${TYPE_LABELS[form.type as EventType]}${form.subtypes.length ? ` · ${form.subtypes.join(' or ')}` : ''}`}
                />
                {form.location && <SummaryRow label="Location" value={form.location} />}
                {form.description && <SummaryRow label="Description" value={form.description} />}
                <SummaryRow
                  label="Dates"
                  value={formatDateRange(form.date_range_start, form.date_range_end)}
                />
                <SummaryRow
                  label="Time options"
                  value={form.time_slots.length > 0 ? form.time_slots.join(', ') : 'None — dates only'}
                />
                {form.questions.filter(Boolean).length > 0 && (
                  <SummaryRow label="Questions" value={form.questions.filter(Boolean).join('; ')} />
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-5 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canProceed()}
                className="bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Creating…' : 'Create event'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-24 flex-shrink-0">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  )
}

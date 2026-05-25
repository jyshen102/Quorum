'use server'

import { createClient } from '@/lib/supabase/server'
import { generateSlug } from '@/lib/utils/slug'
import { redirect } from 'next/navigation'
import type { Event } from '@/lib/types/database'

import type { EventType } from '@/lib/types/database'

export interface EventFormData {
  title: string
  type: EventType | ''
  subtypes: string[]
  location: string
  description: string
  date_range_start: string
  date_range_end: string
  time_slots: string[]
  questions: string[]
}

export async function createEvent(data: EventFormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!data.type) throw new Error('Pick a type')

  const slug = generateSlug(data.title)

  const { data: eventRaw, error } = await supabase
    .from('events')
    .insert({
      title: data.title,
      type: data.type,
      subtype: data.subtypes[0] || null, // primary subtype (back-compat)
      subtypes: data.subtypes,
      location: data.location || null,
      description: data.description || null,
      date_range_start: data.date_range_start,
      date_range_end: data.date_range_end,
      time_slots: data.time_slots,
      status: 'open',
      slug,
    } as any)
    .select()
    .single()

  if (error || !eventRaw) throw new Error(error?.message || 'Failed to create event')

  const event = eventRaw as Event

  if (data.questions.length > 0) {
    const questionsToInsert = data.questions
      .filter((q) => q.trim())
      .map((q, i) => ({
        event_id: event.id,
        question_text: q.trim(),
        display_order: i,
      }))

    if (questionsToInsert.length > 0) {
      await supabase.from('custom_questions').insert(questionsToInsert as any)
    }
  }

  redirect(`/events/${event.id}/admin`)
}

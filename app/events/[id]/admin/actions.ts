'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function closePoll(eventId: string, finalDate: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('events')
    .update({ status: 'closed', final_date: finalDate } as any)
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/events/${eventId}/admin`)
  revalidatePath('/dashboard')
}

export async function reopenPoll(eventId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('events')
    .update({ status: 'open', final_date: null } as any)
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/events/${eventId}/admin`)
  revalidatePath('/dashboard')
}

export interface EventEditData {
  title: string
  subtypes: string[]
  location: string
  description: string
  time_slots: string[]
}

export async function updateEvent(eventId: string, data: EventEditData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!data.title.trim()) throw new Error('Title is required')

  const { error } = await supabase
    .from('events')
    .update({
      title: data.title.trim(),
      subtype: data.subtypes[0] || null,
      subtypes: data.subtypes,
      location: data.location.trim() || null,
      description: data.description.trim() || null,
      time_slots: data.time_slots,
    } as any)
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/events/${eventId}/admin`)
  revalidatePath('/dashboard')
}

export async function deleteEvent(eventId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Cascade deletes handle custom_questions, respondents, responses, custom_answers
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

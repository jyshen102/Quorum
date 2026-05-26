'use server'

import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin'
import { findBestTimeWindow, formatInterval } from '@/lib/utils/timeParse'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function closePoll(eventId: string, finalDate: string): Promise<{ finalTime: string | null }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorized')

  // Compute the most-voted time window for the chosen final date so we can
  // snapshot it onto the event row. (We snapshot instead of re-computing on
  // every read so the answer doesn't shift if a stray response trickles in
  // after the poll closes.)
  const { data: respondentRows } = await supabase
    .from('respondents')
    .select('id')
    .eq('event_id', eventId)
  const respondentIds = (respondentRows ?? []).map((r: any) => r.id as string)

  let finalTime: string | null = null
  if (respondentIds.length > 0) {
    const { data: responseRows } = await supabase
      .from('responses')
      .select('respondent_id, time_slots')
      .eq('date_key', finalDate)
      .in('respondent_id', respondentIds)

    // Group time_slots by respondent (one respondent → one bucket of slots)
    const byRespondent: Record<string, string[]> = {}
    ;(responseRows ?? []).forEach((r: any) => {
      const rid = r.respondent_id as string
      const slots = (r.time_slots ?? []) as string[]
      if (!byRespondent[rid]) byRespondent[rid] = []
      byRespondent[rid].push(...slots)
    })

    const peak = findBestTimeWindow(Object.values(byRespondent))
    if (peak) finalTime = formatInterval(peak.startMin, peak.endMin)
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'closed', final_date: finalDate, final_time: finalTime } as any)
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/events/${eventId}/admin`)
  revalidatePath('/dashboard')

  return { finalTime }
}

export async function reopenPoll(eventId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorized')

  const { error } = await supabase
    .from('events')
    .update({ status: 'open', final_date: null, final_time: null } as any)
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
  date_range_start: string
  date_range_end: string
}

export async function updateEvent(eventId: string, data: EventEditData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorized')

  if (!data.title.trim()) throw new Error('Title is required')
  if (!data.date_range_start || !data.date_range_end) throw new Error('Date range is required')
  if (data.date_range_end < data.date_range_start) throw new Error('End date must be after start date')

  const { error } = await supabase
    .from('events')
    .update({
      title: data.title.trim(),
      subtype: data.subtypes[0] || null,
      subtypes: data.subtypes,
      location: data.location.trim() || null,
      description: data.description.trim() || null,
      time_slots: data.time_slots,
      date_range_start: data.date_range_start,
      date_range_end: data.date_range_end,
    } as any)
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/events/${eventId}/admin`)
  revalidatePath('/dashboard')
}

export async function deleteEvent(eventId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorized')

  // Cascade deletes handle custom_questions, respondents, responses, custom_answers
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

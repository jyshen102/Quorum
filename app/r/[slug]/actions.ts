'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Respondent } from '@/lib/types/database'

export interface SubmitResponseData {
  eventId: string
  name: string
  dateSelections: Array<{
    dateKey: string
    timeSlots: string[]
  }>
  customAnswers: Array<{
    questionId: string
    answerText: string
  }>
}

export async function submitResponse(data: SubmitResponseData) {
  const supabase = createClient()

  const { data: respondentRaw, error: rErr } = await supabase
    .from('respondents')
    .insert({ event_id: data.eventId, name: data.name.trim() } as any)
    .select()
    .single()

  if (rErr || !respondentRaw) throw new Error(rErr?.message || 'Failed to save respondent')
  const respondent = respondentRaw as Respondent

  if (data.dateSelections.length > 0) {
    const responsesToInsert = data.dateSelections.map((sel) => ({
      respondent_id: respondent.id,
      date_key: sel.dateKey,
      time_slots: sel.timeSlots,
    }))
    const { error: resErr } = await supabase.from('responses').insert(responsesToInsert as any)
    if (resErr) throw new Error(resErr.message)
  }

  if (data.customAnswers.length > 0) {
    const answers = data.customAnswers
      .filter((a) => a.answerText.trim())
      .map((a) => ({
        respondent_id: respondent.id,
        question_id: a.questionId,
        answer_text: a.answerText.trim(),
      }))

    if (answers.length > 0) {
      const { error: aErr } = await supabase.from('custom_answers').insert(answers as any)
      if (aErr) throw new Error(aErr.message)
    }
  }

  return { success: true, respondentId: respondent.id }
}

// Fetch a single respondent's full submission so the form can pre-fill when
// they choose to edit. Anyone holding the respondent_id (stored client-side
// in localStorage) can read — matches the existing RLS public-read posture.
export async function getMyResponse(respondentId: string): Promise<{
  found: boolean
  name?: string
  eventId?: string
  dateSelections?: Array<{ dateKey: string; timeSlots: string[] }>
  customAnswers?: Array<{ questionId: string; answerText: string }>
}> {
  const supabase = createClient()

  const { data: respondentRaw } = await supabase
    .from('respondents')
    .select('id, event_id, name')
    .eq('id', respondentId)
    .maybeSingle()

  if (!respondentRaw) return { found: false }
  const r = respondentRaw as { id: string; event_id: string; name: string }

  const [respRes, ansRes] = await Promise.all([
    supabase.from('responses').select('date_key, time_slots').eq('respondent_id', respondentId),
    supabase.from('custom_answers').select('question_id, answer_text').eq('respondent_id', respondentId),
  ])

  return {
    found: true,
    name: r.name,
    eventId: r.event_id,
    dateSelections: (respRes.data ?? []).map((row: any) => ({
      dateKey: row.date_key as string,
      timeSlots: (row.time_slots ?? []) as string[],
    })),
    customAnswers: (ansRes.data ?? []).map((row: any) => ({
      questionId: row.question_id as string,
      answerText: row.answer_text as string,
    })),
  }
}

// Edit an existing response: replace this respondent's responses and
// custom_answers with the new set, and update the name if it changed.
// Strategy is delete-then-insert (Supabase has no native transactional upsert
// for our shape); the small race window is acceptable for this use case.
export async function updateResponse(respondentId: string, data: SubmitResponseData) {
  const supabase = createClient()

  // Verify the respondent exists and belongs to the claimed event
  const { data: existingRaw } = await supabase
    .from('respondents')
    .select('id, event_id')
    .eq('id', respondentId)
    .maybeSingle()
  if (!existingRaw) throw new Error('Response not found')
  const existing = existingRaw as { id: string; event_id: string }
  if (existing.event_id !== data.eventId) throw new Error('Response/event mismatch')

  // Update the name if it changed
  await supabase
    .from('respondents')
    .update({ name: data.name.trim() } as any)
    .eq('id', respondentId)

  // Replace responses
  await supabase.from('responses').delete().eq('respondent_id', respondentId)
  if (data.dateSelections.length > 0) {
    const rows = data.dateSelections.map((sel) => ({
      respondent_id: respondentId,
      date_key: sel.dateKey,
      time_slots: sel.timeSlots,
    }))
    const { error } = await supabase.from('responses').insert(rows as any)
    if (error) throw new Error(error.message)
  }

  // Replace custom answers
  await supabase.from('custom_answers').delete().eq('respondent_id', respondentId)
  const cleanAnswers = data.customAnswers
    .filter((a) => a.answerText.trim())
    .map((a) => ({
      respondent_id: respondentId,
      question_id: a.questionId,
      answer_text: a.answerText.trim(),
    }))
  if (cleanAnswers.length > 0) {
    const { error } = await supabase.from('custom_answers').insert(cleanAnswers as any)
    if (error) throw new Error(error.message)
  }

  // Refresh any admin views looking at this event
  revalidatePath(`/events/${data.eventId}/admin`)

  return { success: true, respondentId }
}

'use server'

import { createClient } from '@/lib/supabase/server'
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

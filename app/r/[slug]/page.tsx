import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RespondentView } from './RespondentView'
import type { Event, CustomQuestion, Respondent, Response } from '@/lib/types/database'

interface Props {
  params: { slug: string }
}

export const dynamic = 'force-dynamic'

export default async function RespondentPage({ params }: Props) {
  const supabase = createClient()

  const { data: eventRaw } = await supabase
    .from('events')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (!eventRaw) notFound()
  const event = eventRaw as Event

  // Fetch questions + respondents + responses in parallel
  const [questionsRes, respondentsRes] = await Promise.all([
    supabase
      .from('custom_questions')
      .select('*')
      .eq('event_id', event.id)
      .order('display_order'),
    supabase
      .from('respondents')
      .select('*')
      .eq('event_id', event.id)
      .order('submitted_at'),
  ])

  const questions = (questionsRes.data ?? []) as CustomQuestion[]
  const respondents = (respondentsRes.data ?? []) as Respondent[]

  // Then fetch responses for those respondents
  let responses: Response[] = []
  if (respondents.length > 0) {
    const { data: responsesRaw } = await supabase
      .from('responses')
      .select('*')
      .in('respondent_id', respondents.map((r) => r.id))
    responses = (responsesRaw ?? []) as Response[]
  }

  return (
    <RespondentView
      event={event}
      questions={questions}
      initialRespondents={respondents}
      initialResponses={responses}
    />
  )
}

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminResults } from './AdminResults'
import type { Event, CustomQuestion, Respondent, Response } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
}

export default async function AdminPage({ params }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: eventRaw } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!eventRaw) notFound()
  const event = eventRaw as Event

  const { data: questionsRaw } = await supabase
    .from('custom_questions')
    .select('*')
    .eq('event_id', event.id)
    .order('display_order')

  const { data: respondentsRaw } = await supabase
    .from('respondents')
    .select('*')
    .eq('event_id', event.id)
    .order('submitted_at')

  const respondents = (respondentsRaw ?? []) as Respondent[]
  const respondentIds = respondents.map((r) => r.id)

  const { data: responsesRaw } = respondentIds.length > 0
    ? await supabase
        .from('responses')
        .select('*')
        .in('respondent_id', respondentIds)
    : { data: [] }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  return (
    <AdminResults
      event={event}
      questions={(questionsRaw ?? []) as CustomQuestion[]}
      initialRespondents={respondents}
      initialResponses={(responsesRaw ?? []) as Response[]}
      shareUrl={`${siteUrl}/r/${event.slug}`}
    />
  )
}

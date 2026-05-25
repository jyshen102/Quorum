import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RespondentView } from './RespondentView'
import type { Event, CustomQuestion } from '@/lib/types/database'

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

  const { data: questionsRaw } = await supabase
    .from('custom_questions')
    .select('*')
    .eq('event_id', event.id)
    .order('display_order')

  return <RespondentView event={event} questions={(questionsRaw ?? []) as CustomQuestion[]} />
}

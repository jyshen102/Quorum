import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewEventWizard } from './NewEventWizard'

export default async function NewEventPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <NewEventWizard />
}

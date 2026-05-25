import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Allowlist gate — only configured admin emails are allowed past auth.
      const { data: { user } } = await supabase.auth.getUser()
      if (!isAdminEmail(user?.email)) {
        // Sign them out immediately so they don't have a dangling session,
        // then send them back to /login with an error flag.
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=not_admin`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}

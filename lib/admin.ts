// Allowlist check for admin sign-ins. The list comes from the ADMIN_EMAILS
// environment variable as a comma-separated lowercase string, e.g.
//   ADMIN_EMAILS="me@example.com,alt@example.com"
// Set this in Vercel → Project Settings → Environment Variables, AND in your
// local .env.local for development.

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  if (ADMIN_EMAILS.length === 0) {
    // Fail closed: if you forgot to set ADMIN_EMAILS, nobody is admin.
    // (Better than silently allowing anyone who can sign in.)
    return false
  }
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

export function adminEmailsConfigured(): boolean {
  return ADMIN_EMAILS.length > 0
}

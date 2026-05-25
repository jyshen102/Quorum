# Quorum – Setup Guide

## 1. Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In **SQL Editor**, run the contents of `supabase/schema.sql` to create all tables, indexes, RLS policies, and enable realtime.
3. In **Project Settings → API**, copy your **Project URL** and **anon/public** key.

## 2. Google OAuth

1. In Supabase: **Authentication → Providers → Google** → enable it.
2. In [Google Cloud Console](https://console.cloud.google.com/):
   - Create an OAuth 2.0 Client ID (Web application).
   - Add **Authorized redirect URIs**: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
3. Copy the Client ID and Secret back into Supabase's Google provider settings.

## 3. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # change to your Vercel URL in production
```

## 4. Run Locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login`.

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in [Vercel](https://vercel.com/new).
3. Add the three env vars in Vercel's project settings.
4. Set `NEXT_PUBLIC_SITE_URL` to your Vercel deployment URL (e.g. `https://quorum-xyz.vercel.app`).
5. In Supabase **Authentication → URL Configuration**, add your Vercel URL to **Redirect URLs**.

## Architecture

```
app/
  page.tsx              → redirects to /dashboard or /login
  login/page.tsx        → Google OAuth button
  auth/callback/        → OAuth exchange handler
  auth/signout/         → POST sign-out handler
  dashboard/page.tsx    → admin event list (server component)
  events/new/           → 3-step wizard (client component)
  events/[id]/admin/    → results view with realtime heatmap
  r/[slug]/             → public respondent form

lib/
  supabase/             → client, server, middleware helpers
  types/database.ts     → TypeScript interfaces
  constants.ts          → time slots, subtypes, badge colors
  utils/dates.ts        → date range, weekend block computation
  utils/slug.ts         → slug generation

supabase/
  schema.sql            → full database schema + RLS policies
```

## Notes

- Weekend blocks for trip events are computed from the date range by finding all Saturdays and grouping Fri/Sat/Sun around them.
- The admin results view subscribes to Supabase realtime on `respondents` and `responses` tables for live updates.
- Slug is auto-generated from event title + 5-char random suffix.
- No auth is required to submit a response — only the admin (you) needs to sign in.

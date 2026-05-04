# Dart Tournament Web App

A mobile-first web application for managing weekly soft-tip dart tournaments with double-elimination brackets, live scoring, and season-long standings.

## Tech Stack

- **Frontend**: React 18 + Vite
- **Hosting**: Netlify (frontend)
- **Backend**: Supabase (PostgreSQL, Auth, Realtime)
- **Styling**: CSS with custom properties (design tokens from UI design doc)
- **Routing**: React Router v6

## Features (v1)

- Single admin login (shared admin account)
- Persistent player roster with walk-in support
- Weekly tournaments with admin-defined game types
- Match formats configurable per game (BO3, BO5, etc.)
- Random seeding with random byes for non-power-of-2 player counts
- Full double-elimination bracket logic (winner's bracket, loser's bracket, grand finals with bracket reset)
- Live scoring interface for admins
- Editable bracket (force winner, swap players, undo)
- Public live bracket view (no login required)
- Public season standings (no login required)
- Player profile pages with tournament history
- Admin-configurable placement bonus points
- Real-time bracket updates via Supabase Realtime

## Setup Instructions

### 1. Create Supabase Project

1. Go to https://supabase.com and create a new project
2. Note your project URL and anon key from Settings > API
3. In the SQL Editor, run the migration files in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_seed_data.sql`
   - `supabase/migrations/004_match_number_nullable.sql`

### 2. Create Admin User

In Supabase Dashboard > Authentication > Users, click "Add user" and create:
- Email: your admin email
- Password: your chosen password
- Auto-confirm: yes

Then in SQL Editor, run:
```sql
UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE email = 'your-admin-email@example.com';
```

### 3. Local Development

```bash
npm install
cp .env.example .env
# Edit .env and add your Supabase URL and anon key
npm run dev
```

### 4. Deploy to Netlify

1. Push this repo to GitHub
2. Connect the repo to Netlify
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add environment variables in Netlify dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Project Structure
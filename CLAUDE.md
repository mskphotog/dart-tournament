# Dart Tournament App: Claude Code Instructions

## Project Overview

Web app for managing weekly soft-tip dart tournaments at a bar. The app generates double-elimination brackets for variable player counts and tracks games, scores, advancement, and season standings.

**Live site**: https://lit-darts.netlify.app
**GitHub repo**: https://github.com/mskphotog/dart-tournament (private)

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Supabase (Postgres 15+, Row Level Security for auth)
- **Auth**: Supabase Auth, admin role detected via `is_admin()` SQL function
- **Routing**: React Router
- **Realtime**: Supabase realtime subscriptions for live bracket updates
- **Styling**: CSS variables for theming (`--space-*`, `--color-*`, etc.)
- **Hosting**: Netlify (auto-deploys from `main` branch)

## Build Commands

```bash
npm run dev      # Local dev server
npm run build    # Production build to dist/
npm run preview  # Preview production build locally
```

## Deployment Workflow

For code changes:

```bash
git add .
git commit -m "describe what changed"
git push
```

Netlify watches `main` and auto-rebuilds in 1 to 2 minutes. No manual deploy step needed.

For database schema changes: run SQL directly in the Supabase SQL Editor, then save the SQL as a numbered file in `supabase/migrations/` for history. Outstanding: migration 004 (the `match_number` nullable change) was run in Supabase but never saved as a file. Should be added.

## Key Files

- `src/lib/bracket.js`: Bracket generation logic. R2-bye model, random seeding, play-order match numbering with rest weighting (1000) and bracket alternation weighting (50).
- `src/lib/bracketDb.js`: Database layer for bracket operations. Handles LB bye auto-advance via runtime feeder counting.
- `src/components/BracketDisplay.jsx` / `.css`: Stacked-card layout, horizontal columns by round. No connector lines.
- `src/pages/AdminTournamentPage.jsx`: Admin scoring interface.
- `src/pages/TournamentBracketPage.jsx`: Public bracket view.

## Bracket Conventions

- Minimum 6 players required
- Bye players skip Round 1 entirely, start in WB Round 2
- Bye recipients chosen randomly, not given to top seeds
- Match numbers reflect play order, not bracket position
- LB bye matches have `match_number = NULL` (they auto-advance)
- L# notation in empty LB slots means "loser of match #" until that match resolves

## Working Style Preferences

**STRICT RULES:**
- Never use em dashes under any circumstances
- Always provide complete file contents, never snippets, diffs, or partial code
- Use clear, non-expert language when explaining code
- Ask clarifying questions until 95% confident before starting any complex task
- Tone: 70% professional, 30% collaborative partner
- Code must be clean, scalable, and heavily commented for future maintenance
- Proactively suggest UI/UX improvements and automation opportunities

**WRITING VOICE (for any user-facing content):**
- No AI-sounding throat-clearing phrases
- No salesy language, urgency triggers, or superlatives used for effect
- No buzzwords like "world-class," "seamless," "curated," "transformative"
- No exclamation points used for hype
- Write with specificity, name actual things, vague generalities are worthless
- Trust the reader, don't over-explain or add unnecessary disclaimers
- Keep religion and politics entirely out of all content
- Structure content like a clear briefing with logical progression

**For multi-file edits**: ask the user to upload or open the relevant files rather than reconstructing from memory or context history. Lower risk of introducing errors.

## Open Items

- **Seed numbers in bracket display**: `BracketDisplay` accepts an optional `seedByPlayerId` prop, but `AdminTournamentPage` and `TournamentBracketPage` don't pass one. Seed numbers won't appear in WB R1 until both pages pass this prop, or until `BracketDisplay` queries seeds itself.
- **Migration 004**: Save the `ALTER TABLE matches ALTER COLUMN match_number DROP NOT NULL;` SQL as `supabase/migrations/004_match_number_nullable.sql` for clean history.
- **Email/phone columns** on `players` table: currently unused, sitting empty. Decide whether to populate, remove, or leave for future use.
- **PWA conversion**: not implemented. Would require manifest, service worker, icons. Discussed but deferred.

## Database Notes

- All 8 tables have RLS enabled
- Public read access for tournament data
- Admin-only writes everywhere
- `audit_log` table is fully locked down (admin read AND write only)
- `.env` file holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, gitignored, also set in Netlify environment variables
# Dart Tournament App: Session Summary

## Project Overview

Web app for managing weekly soft-tip dart tournaments at a bar. Built with React (Vite) + Supabase, deployed to Netlify. The app generates double-elimination brackets for variable player counts and tracks games, scores, advancement, and season standings.

**Live site**: https://lit-darts.netlify.app
**GitHub repo (private)**: https://github.com/mskphotog/dart-tournament
**Local path**: `/Volumes/4TBSSD/Downloads/LITDarts/dart-tournament/`

## What Was Accomplished This Session

### 1. Bracket Generation Rewrite

Completely rewrote `src/lib/bracket.js` with new conventions matching standard tournament bracket displays (PrintYourBrackets-style). Key changes:

- **R2-bye model**: Bye players skip Round 1 entirely and start in WB Round 2 paired with R1 winners. No more phantom "bye vs bye" matches.
- **Random seeding**: Pure random shuffle for R1 pairings. Seeds 1 through N assigned for display purposes only.
- **Random byes**: Bye recipients chosen randomly from the player pool, not given to top seeds.
- **Minimum 6 players** required for bracket generation.
- **Play-order match numbering**: Matches numbered 1-N in the order they should be played, with these priorities:
  - Player rest (heavy weight: 1000): a player should not appear in two consecutive matches AND should ideally have 2 matches between their appearances
  - Bracket alternation (light weight: 50): cosmetically prefer switching between WB and LB
  - Earlier rounds first
  - Lower position-in-round first

### 2. Database Layer Updates

Rewrote `src/lib/bracketDb.js` to handle the new bracket structure:

- **LB bye auto-advance**: Single-feeder Loser's Bracket matches (where only one player can ever arrive) auto-complete and advance the lone player without requiring a played game
- **Runtime LB bye detection** (no schema flag needed): counts feeder matches via `next_match_winner_id`/`next_match_loser_id` to detect single-feeder LB matches
- **Recursive bye handling** for chained LB byes
- **Updated undo logic** to handle bye matches correctly

### 3. Display Layout Reverted to Stacked Cards

After attempting an SVG tree view that broke badly with non-power-of-2 player counts, reverted `BracketDisplay.jsx` and `BracketDisplay.css` to a horizontal-columns-by-round card layout. Each section (WB, LB, Grand Final) stacks vertically; rounds within each section flow left-to-right with each match as a card. No connector lines (too fragile in HTML/CSS). Cards use a 280px minimum width with flexbox-based interior layout. The bracket reset match has dashed borders with "If First Loss" label.

The `match-card-name` element required `flex: 1 1 auto; min-width: 0` to properly handle ellipsis truncation in flexbox.

### 4. L# Notation in Loser's Bracket

Empty LB slots that are scheduled to receive a WB loser display as `L<match_number>` (e.g., "L7" means "loser of match 7 will go here"). Once that match completes and the loser is assigned, the L# swaps to the actual player name.

### 5. Database Migration

Ran one schema change in Supabase:

```sql
ALTER TABLE matches ALTER COLUMN match_number DROP NOT NULL;
```

This was needed because LB bye matches don't get a play-order number (they're not played).

### 6. RLS Audit

Verified all 8 tables have row-level security enabled with correct policies: public read access for tournament data, admin-only writes everywhere, audit_log fully locked down (admin read AND write). Concluded: existing RLS is production-safe.

Decided to leave email/phone columns on `players` table empty/unused for now rather than do a complex view-based privacy fix.

### 7. GitHub & Netlify Deployment

- Initialized git in the project, made initial commit
- Used `gh` CLI (already authenticated as `mskphotog`) to create private repo
- Connected to Netlify via web UI
- Set environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Auto-deploy pipeline live: pushes to `main` branch trigger Netlify rebuilds
- Verified site loads, public bracket viewing works, admin login works

## Open Items / Future Work

**Not blocking, can address later:**

- **PWA conversion**: Discussed briefly. Would add manifest, service worker, icons for "Add to Home Screen" experience. Skipped for now.
- **Seed numbers in bracket display**: BracketDisplay accepts an optional `seedByPlayerId` prop but the calling pages (AdminTournamentPage, TournamentBracketPage) don't currently pass one. So seed numbers aren't appearing in WB R1 yet. Fix requires editing both page files OR enriching the BracketDisplay to query seeds itself.
- **Migration file 004**: The match_number-nullable migration was run directly in Supabase but never saved as a file in `supabase/migrations/`. Should be added for clean migration history.
- **Board count configuration**: Discussed but ruled out. The play-order algorithm just avoids back-to-back per-player rather than tracking board availability.
- **email/phone columns**: Sitting unused on `players` table. Functional cleanup deferred.

## My Working Style With This Project

User's preferences (from `<userPreferences>`):

- No em dashes, ever
- Always provide complete file contents (never snippets, diffs, or partial code)
- Clear, non-expert language for code explanations
- Ask clarifying questions until 95% confident before starting complex work
- Tone: 70% professional, 30% collaborative partner
- Heavily commented code for future maintenance
- Proactively suggest UI/UX improvements
- Writing voice: no AI throat-clearing, no buzzwords, no exclamation points for hype, specificity over vague generalities, no religion/politics
- For requests requiring multi-page edits: ask user to upload the relevant files rather than reconstructing from conversation history (lower risk)

## Tech Stack Reminders

- React 18 + Vite (build via `npm run build`, output in `dist/`)
- Supabase (Postgres 15+, RLS for auth)
- Authentication: Supabase Auth, admin role detected via `is_admin()` SQL function
- Realtime subscriptions for live bracket updates
- React Router for navigation
- CSS variables for theming (`--space-*`, `--color-*` etc.)

## Deployment Workflow

For code changes:

```bash
git add .
git commit -m "describe what changed"
git push
```

Netlify watches `main` and auto-rebuilds in 1-2 minutes.

For database schema changes: run SQL directly in Supabase SQL Editor, then save the SQL as a numbered file in `supabase/migrations/` for history.

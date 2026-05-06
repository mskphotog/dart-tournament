# LIT Darts — Manus Project Context

## Project Overview

**LIT Darts** is a web-based darts tournament management application built for a bar/venue setting. It allows an admin to run double-elimination dart tournaments, manage players, track scores, and send real-time push notifications to players when their match is ready.

The app was originally scaffolded by Claude and transferred to Manus for continued development, bug fixing, PWA conversion, and push notification implementation.

---

## Live URLs

| Environment | URL |
|---|---|
| Production (Netlify) | https://lit-darts.netlify.app |
| GitHub Repository | https://github.com/mskphotog/dart-tournament |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + JavaScript (JSX) |
| Styling | Custom CSS with CSS variables (dark theme, OrangeRed #FF4500 accent) |
| Routing | React Router v6 |
| Backend / Database | Supabase (PostgreSQL with Row Level Security) |
| Hosting | Netlify (auto-deploys from GitHub main branch) |
| DNS / CDN | Cloudflare |
| PWA | vite-plugin-pwa (injectManifest mode) + custom service worker |
| Push Notifications | Web Push API + VAPID + Netlify serverless functions |
| Version Control | GitHub (public repo: mskphotog/dart-tournament) |

---

## Repository Structure

```
dart-tournament/
├── src/
│   ├── App.jsx                          # Main routing
│   ├── components/
│   │   ├── Layout.jsx                   # App shell with NotificationPrompt
│   │   ├── Layout.css
│   │   ├── NotificationPrompt.jsx       # Player push subscription banner
│   │   ├── NotificationPrompt.css
│   │   └── SendNotificationPanel.jsx    # Admin push send UI
│   ├── lib/
│   │   ├── bracket.js                   # Double-elimination bracket logic
│   │   ├── bracketDb.js                 # Bracket Supabase operations
│   │   ├── pushNotifications.js         # Client-side push subscription utils
│   │   └── supabase.js                  # Supabase client
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── AdminDashboardPage.jsx   # Admin home (includes push panel)
│   │   │   ├── AdminTournamentPage.jsx
│   │   │   └── ...
│   │   └── public/
│   │       └── ...
│   └── styles/
│       └── global.css                   # Global CSS variables and base styles
├── public/
│   ├── sw-push.js                       # Custom service worker (push handler)
│   ├── icons/                           # PWA icons (72px to 512px + Apple touch)
│   ├── favicon.ico
│   └── lit_darts_install_card.png       # Bar instruction card image
├── netlify/
│   └── functions/
│       ├── save-subscription.js         # Saves push subscription to Supabase
│       └── send-notification.js         # Sends push to all subscribers (admin only)
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_...
│       ├── 003_...
│       ├── 004_match_number_nullable.sql
│       └── 005_push_subscriptions.sql   # push_subscriptions table + RLS
├── vite.config.js                       # Vite + vite-plugin-pwa (injectManifest)
├── netlify.toml                         # Netlify build + functions config
├── CLAUDE.md                            # Original Claude project instructions
├── SESSION_SUMMARY_v1.md                # Claude session history
└── README.md
```

---

## Database Schema (Supabase)

### Core Tables
| Table | Purpose |
|---|---|
| `players` | Player profiles (name, email, phone) |
| `game_types` | Game formats (501, Cricket, etc.) |
| `tournaments` | Tournament instances |
| `matches` | Individual matches within a tournament |
| `games` | Individual games within a match |
| `season_standings` | SQL view: auto-calculated rankings, win/placement points |

### Push Notifications Table
| Table | Purpose |
|---|---|
| `push_subscriptions` | Stores Web Push subscription objects (endpoint, p256dh, auth) |

**RLS Policies on push_subscriptions:**
- Anyone can INSERT (subscribe)
- Only authenticated admins can SELECT or DELETE

---

## PWA Configuration

- **Manifest name:** LIT Darts
- **Theme color:** `#FF4500` (OrangeRed)
- **Background color:** `#1a1a1a`
- **Display mode:** standalone
- **Start URL:** `/`
- **Icons:** 72, 96, 128, 144, 152, 192, 384, 512px + Apple touch icon (180px)
- **Service worker mode:** `injectManifest` — Workbox precaching + custom `sw-push.js`

---

## Push Notification Architecture

### VAPID Keys (stored as Netlify environment variables)
| Variable | Notes |
|---|---|
| `VAPID_PUBLIC_KEY` | Public key — also baked into frontend as `VITE_VAPID_PUBLIC_KEY` |
| `VAPID_PRIVATE_KEY` | Secret — used server-side only |
| `VAPID_SUBJECT` | `mailto:admin@lit-darts.netlify.app` |

### Netlify Environment Variables Required
```
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
VITE_VAPID_PUBLIC_KEY      (same value as VAPID_PUBLIC_KEY — baked into frontend build)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY  (secret — bypasses RLS for server functions)
SUPABASE_ANON_KEY
```

### Push Flow
1. Player visits app → `NotificationPrompt` appears after 2.5s (not on admin pages)
2. On iOS: prompt only appears in standalone mode (installed PWA) — Safari suppresses it
3. Player taps "Yes, notify me" → browser permission prompt → `PushManager.subscribe()`
4. Subscription saved to Supabase `push_subscriptions` table via `/.netlify/functions/save-subscription`
5. Admin opens Dashboard → `SendNotificationPanel` shows subscriber count
6. Admin taps quick-send button or sends custom message → `/.netlify/functions/send-notification`
7. Function reads all subscriptions from Supabase, sends via `web-push` library
8. Service worker `push` event handler in `sw-push.js` receives and displays notification
9. Expired/invalid subscriptions are automatically cleaned up after each send

### Key Technical Notes
- VAPID key decoding uses a manual base64 lookup table (NOT `atob()`) — required for Android Chrome compatibility
- Service worker uses `skipWaiting()` and `clientsClaim()` for immediate activation on update
- Push payload format: `{ title, body, icon, badge, tag, data: { url } }`

---

## Admin Features

- **Tournament management:** Create, start, advance tournaments
- **Player management:** Add/remove players
- **Score entry:** Enter match scores
- **Push notifications panel:** 
  - View subscriber count
  - Quick-send buttons: Match Ready, Finals Time, Short Break, Tournament Done
  - Custom message form (title + body)

---

## Known Completed Work (as of May 2026)

- [x] Double-elimination bracket engine
- [x] Supabase schema with RLS
- [x] Admin authentication
- [x] PWA conversion (manifest, service worker, icons)
- [x] Push notification stack (VAPID, subscription flow, serverless send function)
- [x] iOS standalone-mode check for notification prompt
- [x] Mobile font size fix (rem units, 18px base on mobile)
- [x] Bar instruction card image (`public/lit_darts_install_card.png`)

---

## Pending / Future Work

- [ ] Player check-in flow for tournament night
- [ ] Match scheduling / play order display
- [ ] Public-facing bracket view (read-only for spectators)
- [ ] Season standings leaderboard page
- [ ] "How to install" in-app guide for iPhone users
- [ ] QR code generation for the instruction card

---

## Owner

**Mark Kelly** — Travel Advisor & Web Presence Developer  
GitHub: mskphotog  
Business: 954 Web Studio (https://954webstudio.com)

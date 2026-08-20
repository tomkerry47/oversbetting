# Betting Overs

A football betting tracker for Saturday 15:00 kick-offs. Four players make 2 fixture selections each week, tracking whether games go over 2.5 goals.

## Setup

### 1. Supabase
- Create a Supabase project at [supabase.com](https://supabase.com)
- Run the SQL from `supabase/schema.sql` in the Supabase SQL editor
- Copy your project URL and anon key

### 2. Environment Variables
Copy `.env.local.example` to `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_ARENA_EMBED_KEY=your-arena-embed-key
RAPIDAPI_KEY=your-rapidapi-key
USE_RAPIDAPI=true
ENRICH_FIXTURES=true
ENRICH_ODDS=false
ROUND_REQUEST_BUDGET=100
```

Create the Arena3D embed key in the Arena dashboard and allow both the production
domain and `localhost` if you want to preview WS+ matches locally. The key is an
iframe credential intended to appear in the embed URL; the BSD Sports API token
remains server-side and is not interchangeable with it.

### 3. Install & Run
```bash
npm install
npm run dev
```

### 4. Deploy to Vercel
- Push to GitHub
- Connect repo to Vercel
- Add the same environment variables in Vercel dashboard
- Add `RAPIDAPI_KEY` to GitHub Actions secrets for the scheduled/manual fixture and results workflows
- Run `supabase/migrations/add_week_request_usage.sql` to store per-round RapidAPI request budget/usage
- Deploy!

## SofaScore / RapidAPI Notes

See `SOFASCORE_RAPIDAPI_MCP.md` for the working MCP health checks, direct
RapidAPI fixture commands, local trigger commands, and the low-call enrichment
plan.

## Features
- Select from Saturday 15:00 kick-offs (English top 5 + Scottish top 3 leagues)
- 4 players: Kezza, Mikey, Krissy, Tommy
- Auto-check results after 17:00 Saturday
- Fine system (0-0 = £5, 1 goal = £2, both 0-0 = £20)
- Weekly performance tracking & stats
- Auto-reset on Sunday

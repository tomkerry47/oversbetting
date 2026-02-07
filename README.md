# Betting Overs

A football betting tracker for Saturday 15:00 kick-offs. Four players make 2 fixture selections each week, tracking whether games go over 3.5 goals.

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
FOOTBALL_API_KEY=8bb20a808798c716dd25fb918ff591b2
```

### 3. Install & Run
```bash
npm install
npm run dev
```

### 4. Deploy to Vercel
- Push to GitHub
- Connect repo to Vercel
- Add the same environment variables in Vercel dashboard
- Deploy!

## Features
- Select from Saturday 15:00 kick-offs (English top 5 + Scottish top 3 leagues)
- 4 players: Kezza, Mikey, Krissy, Tommy
- Auto-check results after 17:00 Saturday
- Fine system (0-0 = £5, 1 goal = £2, both 0-0 = £20)
- Weekly performance tracking & stats
- Auto-reset on Sunday

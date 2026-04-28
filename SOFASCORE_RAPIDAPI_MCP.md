# SofaScore RapidAPI MCP Runbook

This keeps the working commands for the RapidAPI MCP endpoint in one place.
Do not paste real API keys into commands or docs; export `RAPIDAPI_KEY` locally.

## Required Environment

```bash
export RAPIDAPI_KEY="your-rapidapi-key"
export RAPIDAPI_HOST="sofascore.p.rapidapi.com"
export RAPIDAPI_MCP_URL="https://mcp.rapidapi.com"
```

For the site and GitHub Actions, set:

```bash
RAPIDAPI_KEY=your-rapidapi-key
USE_RAPIDAPI=true
ENRICH_FIXTURES=true
ENRICH_ODDS=false
```

## Codex MCP Config

Codex config lives at `~/.codex/config.toml`.

```toml
[mcp_servers."RapidAPI Hub - Sofascore"]
command = "npx"
args = [
  "-y",
  "mcp-remote",
  "https://mcp.rapidapi.com",
  "--header",
  "x-api-host: sofascore.p.rapidapi.com",
  "--header",
  "x-api-key:${RAPIDAPI_KEY}",
]
env = { RAPIDAPI_KEY = "your-rapidapi-key" }
```

`-y` matters because otherwise `npx` can wait for install confirmation during MCP startup.

## MCP Health Checks

Reachability:

```bash
curl -I \
  -H "x-api-host: $RAPIDAPI_HOST" \
  -H "x-api-key: $RAPIDAPI_KEY" \
  "$RAPIDAPI_MCP_URL"
```

Expected result: HTTP 405 with `allow: GET` and `allow: POST`.

Initialize:

```bash
curl -s -i -X POST \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "x-api-host: $RAPIDAPI_HOST" \
  -H "x-api-key: $RAPIDAPI_KEY" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"codex-curl","version":"0.0.1"}}}' \
  "$RAPIDAPI_MCP_URL"
```

Expected result: `RapidAPI MCP Server` with `capabilities.tools`.

List tool names:

```bash
curl -s -X POST \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "x-api-host: $RAPIDAPI_HOST" \
  -H "x-api-key: $RAPIDAPI_KEY" \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  "$RAPIDAPI_MCP_URL" \
  | jq -r '.result.tools[].name'
```

Find fixture/event tools:

```bash
curl -s -X POST \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "x-api-host: $RAPIDAPI_HOST" \
  -H "x-api-key: $RAPIDAPI_KEY" \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  "$RAPIDAPI_MCP_URL" \
  | jq -r '.result.tools[].name' \
  | rg 'scheduled|match|fixture|event'
```

Inspect the scheduled-events schema:

```bash
curl -s -X POST \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "x-api-host: $RAPIDAPI_HOST" \
  -H "x-api-key: $RAPIDAPI_KEY" \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  "$RAPIDAPI_MCP_URL" \
  | jq '.result.tools[] | select(.name=="tournamentsget-scheduled-events")'
```

Call scheduled events for a date:

```bash
curl -s -X POST \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "x-api-host: $RAPIDAPI_HOST" \
  -H "x-api-key: $RAPIDAPI_KEY" \
  --data '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tournamentsget-scheduled-events","arguments":{"categoryId":1,"date":"2026-04-28"}}}' \
  "$RAPIDAPI_MCP_URL" \
  | jq -r '.result.content[0].text' \
  | jq '.events | length'
```

Note: this MCP tool is useful for proving MCP access, but it is scoped by
`categoryId`. `categoryId=1` returns the England football category. For the app
import, prefer the direct RapidAPI all-football scheduled-events endpoint below
so England and Scotland can be filtered from one response.

Show a compact fixture sample:

```bash
curl -s -X POST \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "x-api-host: $RAPIDAPI_HOST" \
  -H "x-api-key: $RAPIDAPI_KEY" \
  --data '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tournamentsget-scheduled-events","arguments":{"categoryId":1,"date":"2026-04-28"}}}' \
  "$RAPIDAPI_MCP_URL" \
  | jq -r '.result.content[0].text' \
  | jq '.events[:5][] | {id, league: .tournament.uniqueTournament.name, home: .homeTeam.name, away: .awayTeam.name, startTimestamp, status: .status.type}'
```

## Direct RapidAPI Checks

The app's fixture import uses RapidAPI's category-scoped scheduled-events
endpoint. Use England (`categoryId=1`) and Scotland (`categoryId=22`), then merge
and filter locally.

```bash
curl -s \
  -H "x-rapidapi-host: $RAPIDAPI_HOST" \
  -H "x-rapidapi-key: $RAPIDAPI_KEY" \
  "https://$RAPIDAPI_HOST/tournaments/get-scheduled-events?categoryId=1&date=2026-04-28" \
  | jq '.events | length'
```

Check both categories for a date:

```bash
for category in 1 22; do
  printf "category %s: " "$category"
  curl -s \
    -H "x-rapidapi-host: $RAPIDAPI_HOST" \
    -H "x-rapidapi-key: $RAPIDAPI_KEY" \
    "https://$RAPIDAPI_HOST/tournaments/get-scheduled-events?categoryId=$category&date=2026-04-28" \
    | jq '.events | length'
done
```

Compact tracked-league sample for England:

```bash
curl -s \
  -H "x-rapidapi-host: $RAPIDAPI_HOST" \
  -H "x-rapidapi-key: $RAPIDAPI_KEY" \
  "https://$RAPIDAPI_HOST/tournaments/get-scheduled-events?categoryId=1&date=2026-04-28" \
  | jq '.events[]
    | select([19,347,17,18,24,25,173,36,206,207,209] | index(.tournament.uniqueTournament.id))
    | {id, league: .tournament.uniqueTournament.name, home: .homeTeam.name, away: .awayTeam.name, startTimestamp, status: .status.type}'
```

Fetch one match detail/result:

```bash
curl -s \
  -H "x-rapidapi-host: $RAPIDAPI_HOST" \
  -H "x-rapidapi-key: $RAPIDAPI_KEY" \
  "https://$RAPIDAPI_HOST/matches/detail?matchId=14023926" \
  | jq '.event | {id, home: .homeTeam.name, away: .awayTeam.name, homeScore: .homeScore.current, awayScore: .awayScore.current, status: .status.type}'
```

MCP-confirmed endpoint map used by the app/workflows:

```text
fixtures by date: /tournaments/get-scheduled-events?categoryId={1|22}&date={YYYY-MM-DD}
match result/detail: /matches/detail?matchId={fixtureId}
team recent form: /teams/get-last-matches?teamId={teamId}&pageIndex=0
over/under odds: /matches/get-all-odds?matchId={fixtureId}
league standings: /tournaments/get-standings?tournamentId={leagueId}&seasonId={seasonId}&type=total
```

## Site Commands

Install and run locally:

```bash
npm install
npm run dev
```

Run a local production build:

```bash
npm run build
```

Trigger fixture sync through the site API while the dev server is running:

```bash
curl -s -X POST http://localhost:3000/api/fixtures/trigger \
  -H "content-type: application/json" \
  --data '{"weekOffset":1,"enrich":true,"enrichOdds":false}' \
  | jq
```

Trigger a custom fixture sync:

```bash
curl -s -X POST http://localhost:3000/api/fixtures/trigger \
  -H "content-type: application/json" \
  --data '{"targetDate":"2026-04-28","kickoffTime":"19:45","isCustom":true,"enrich":true,"enrichOdds":false}' \
  | jq
```

Debug RapidAPI from the site:

```bash
curl -s "http://localhost:3000/api/debug/rapidapi?categoryId=1" | jq
```

Run the GitHub Actions fixture script locally:

```bash
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
RAPIDAPI_KEY="$RAPIDAPI_KEY" \
USE_RAPIDAPI=true \
ENRICH_FIXTURES=true \
ENRICH_ODDS=false \
node scripts/fetch-fixtures-to-supabase.mjs --weekOffset=1
```

Run the TLS fallback script:

```bash
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
RAPIDAPI_KEY="$RAPIDAPI_KEY" \
USE_RAPIDAPI=true \
python3 scripts/fetch-fixtures-tls.py --weekOffset=1 --enrich=true --enrichOdds=false
```

## Lowest-Call Fixture Enrichment

Current best baseline:

1. Two fixture list calls per date: direct RapidAPI `GET /tournaments/get-scheduled-events?categoryId=1&date={date}` and `categoryId=22`.
2. Filter locally to the tracked leagues and UK kickoff time.
3. Store everything already present on each event: fixture id, teams, team ids, league id/name, kickoff, status, score, season id, round, winner code.

Enrichment priorities with the fewest extra calls:

1. Table position: group fixtures by `uniqueTournament.id` and `season.id`; call standings once per league-season, then map both teams locally.
2. Team form: only enrich fixtures that are actually displayed or selected. Use one `teamsget-last-matches` call per unique team and cache by `teamId`.
3. Odds: avoid all odds on fixture import. Fetch odds only for selected fixtures or detail view, one `matchesget-all-odds` or `matchesget-featured-odds` call per selected match.
4. Match detail/statistics: do not call per fixture during import. Use `matchesdetail` only when a fixture card/detail panel needs fields missing from scheduled events.

Recommended import call shape for a normal Saturday:

```text
2 scheduled-events calls
+ N standings calls where N = number of leagues present that day
+ 0 form/odds/detail calls during import
```

Recommended on-demand call shape after users make picks:

```text
up to 16 team-form calls for 8 selected fixtures, cached by teamId
+ up to 8 odds/detail calls only if the UI displays those fields
```

This keeps the weekly fixture import cheap and predictable, while still allowing richer selected-fixture views.

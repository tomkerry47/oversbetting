#!/usr/bin/env python3
"""
Fetch SofaScore fixtures with browser-like TLS fingerprinting, enrich with form/odds,
and upsert into Supabase.

Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  python3 scripts/fetch-fixtures-tls.py --weekOffset=1
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

import requests

try:
    from scrapling.fetchers import FetcherSession
except ImportError as exc:
    raise SystemExit(
        "Missing Python dependency for Scrapling "
        f"({exc}). Install with: pip3 install -r scripts/requirements-tls.txt"
    ) from exc


API_BASES = (
    "https://api.sofascore.com/api/v1",
    "https://www.sofascore.com/api/v1",
    "https://api.sofavpn.com/api/v1",
    "https://www.sofavpn.com/api/v1",
)
RAPIDAPI_HOST = "sofascore.p.rapidapi.com"
RAPIDAPI_BASE = f"https://{RAPIDAPI_HOST}"
RAPIDAPI_FOOTBALL_CATEGORY_IDS = (1, 22)  # England, Scotland
DEFAULT_RETRIES = 3
UK_TZ = ZoneInfo("Europe/London")

SOFASCORE_TOURNAMENTS: Dict[int, str] = {
    19: "FA Cup",
    347: "Scottish Cup",
    17: "Premier League",
    18: "Championship",
    24: "League One",
    25: "League Two",
    173: "National League",
    36: "Scottish Premiership",
    206: "Scottish Championship",
    207: "Scottish League One",
    209: "Scottish League Two",
}

STANDINGS_CACHE: Dict[str, Dict[int, int]] = {}
RAPIDAPI_REQUEST_LIMIT: int | None = None
RAPIDAPI_REQUESTS_USED = 0


class RapidApiBudgetExhausted(RuntimeError):
    pass


def use_rapidapi() -> bool:
    return os.getenv("USE_RAPIDAPI", "true").strip().lower() != "false" and bool(os.getenv("RAPIDAPI_KEY"))


def truthy_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"true", "1", "yes"}


def enrich_fixtures_enabled() -> bool:
    return truthy_env("ENRICH_FIXTURES", True)


def enrich_odds_enabled() -> bool:
    return truthy_env("ENRICH_ODDS", False)


def request_budget_default() -> int:
    value = os.getenv("ROUND_REQUEST_BUDGET", "100")
    try:
        return max(1, int(value))
    except ValueError:
        return 100


def configure_rapidapi_budget(limit: int | None) -> None:
    global RAPIDAPI_REQUEST_LIMIT, RAPIDAPI_REQUESTS_USED
    RAPIDAPI_REQUEST_LIMIT = limit
    RAPIDAPI_REQUESTS_USED = 0


def rapidapi_budget_remaining() -> int | None:
    if RAPIDAPI_REQUEST_LIMIT is None:
        return None
    return max(0, RAPIDAPI_REQUEST_LIMIT - RAPIDAPI_REQUESTS_USED)


def rapidapi_get(endpoint: str, retries: int = DEFAULT_RETRIES) -> Dict[str, Any]:
    api_key = os.getenv("RAPIDAPI_KEY")
    if not api_key:
        raise RuntimeError("RAPIDAPI_KEY environment variable is not set")

    url = f"{RAPIDAPI_BASE}{endpoint}"
    headers = {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": api_key,
    }
    last_error: Exception | None = None

    for attempt in range(retries):
        global RAPIDAPI_REQUESTS_USED
        if RAPIDAPI_REQUEST_LIMIT is not None and RAPIDAPI_REQUESTS_USED >= RAPIDAPI_REQUEST_LIMIT:
            raise RapidApiBudgetExhausted(
                f"RapidAPI request budget exhausted ({RAPIDAPI_REQUESTS_USED}/{RAPIDAPI_REQUEST_LIMIT})"
            )
        RAPIDAPI_REQUESTS_USED += 1
        response = requests.get(url, headers=headers, timeout=45)
        if response.status_code == 200:
            return response.json()

        last_error = RuntimeError(
            f"RapidAPI error {response.status_code} for {endpoint}: {response.text[:300]}"
        )
        if response.status_code in {429, 500, 502, 503, 504} and attempt < retries - 1:
            time.sleep(1.5 + attempt)
            continue
        break

    raise last_error or RuntimeError(f"RapidAPI request failed for {endpoint}")


def rapidapi_endpoint_for_sofa(endpoint: str) -> str:
    if endpoint.startswith("/event/") and endpoint.endswith("/odds/1/all"):
        fixture_id = endpoint.split("/")[2]
        return f"/matches/get-all-odds?matchId={fixture_id}"

    if endpoint.startswith("/event/"):
        fixture_id = endpoint.split("/")[2]
        return f"/matches/detail?matchId={fixture_id}"

    if endpoint.startswith("/team/") and endpoint.endswith("/events/last/0"):
        team_id = endpoint.split("/")[2]
        return f"/teams/get-last-matches?teamId={team_id}&pageIndex=0"

    if endpoint.startswith("/unique-tournament/") and endpoint.endswith("/standings/total"):
        parts = endpoint.strip("/").split("/")
        tournament_id = parts[1]
        season_id = parts[3]
        return f"/tournaments/get-standings?tournamentId={tournament_id}&seasonId={season_id}&type=total"

    return endpoint


def set_default_insights(row: Dict[str, Any]) -> None:
    row["home_form"] = []
    row["away_form"] = []
    row["odds_over_25"] = None
    row["odds_under_25"] = None
    row["home_team_position"] = None
    row["away_team_position"] = None
    row["is_star_pick"] = False
    row["star_rank"] = None
    row["star_score"] = None
    row["insights_updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weekOffset", type=int, default=1, help="0=current week, 1=next week")
    parser.add_argument("--targetDate", type=str, help="Explicit target date in YYYY-MM-DD format")
    parser.add_argument("--kickoffTime", type=str, help="Explicit UK kickoff time in HH:MM or HH:MM:SS")
    parser.add_argument("--isCustom", type=str, help="Explicit custom-round flag: true or false")
    parser.add_argument("--enrich", type=str, help="Enrich form/positions/star picks: true or false")
    parser.add_argument("--enrichOdds", type=str, help="Fetch per-match odds during enrichment: true or false")
    parser.add_argument("--requestBudget", type=int, help="Max RapidAPI requests to spend for this round")
    return parser.parse_args()


def get_relevant_saturday(week_offset: int) -> str:
    now_uk = dt.datetime.now(UK_TZ).date()
    weekday = now_uk.weekday()  # Mon=0 ... Sun=6

    if weekday == 5:  # Saturday
        saturday = now_uk
    elif weekday == 6:  # Sunday -> next Saturday
        saturday = now_uk + dt.timedelta(days=6)
    else:  # Mon-Fri -> coming Saturday
        saturday = now_uk + dt.timedelta(days=(5 - weekday))

    saturday += dt.timedelta(days=week_offset * 7)
    return saturday.isoformat()


def get_current_season() -> str:
    now_uk = dt.datetime.now(UK_TZ)
    year = now_uk.year
    month = now_uk.month
    if month >= 8:
        return f"{year}-{str(year + 1)[-2:]}"
    return f"{year - 1}-{str(year)[-2:]}"


def calculate_week_number(saturday_date: str, season_start: str = "2025-08-01") -> int:
    saturday = dt.date.fromisoformat(saturday_date)
    start = dt.date.fromisoformat(season_start)
    diff_weeks = (saturday - start).days // 7
    return max(1, diff_weeks + 1)


def normalize_kickoff_time(kickoff_time: str) -> str:
    parts = str(kickoff_time or "").strip().split(":")
    if len(parts) < 2:
      raise ValueError("kickoffTime must be in HH:MM or HH:MM:SS format")
    hours = parts[0].zfill(2)
    minutes = parts[1].zfill(2)
    seconds = parts[2].zfill(2) if len(parts) > 2 else "00"
    return f"{hours}:{minutes}:{seconds}"


def parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise ValueError("Boolean flags must be true or false")


def get_saturday_for_target_date(target_date: str) -> str:
    date_value = dt.date.fromisoformat(target_date)
    weekday = date_value.weekday()  # Mon=0 ... Sun=6

    if weekday == 5:
        saturday = date_value
    elif weekday == 6:
        saturday = date_value + dt.timedelta(days=6)
    else:
        saturday = date_value + dt.timedelta(days=(5 - weekday))

    return saturday.isoformat()


def get_tls_session() -> FetcherSession:
    return FetcherSession(
        impersonate="chrome",
        stealthy_headers=True,
        headers={
            "Origin": "https://www.sofascore.com",
            "Referer": "https://www.sofascore.com/",
        },
    )


def sofa_get(session: Any, endpoint: str, retries: int = DEFAULT_RETRIES) -> Dict[str, Any]:
    if use_rapidapi():
        return rapidapi_get(rapidapi_endpoint_for_sofa(endpoint), retries)

    last_error: Exception | None = None
    for base_url in API_BASES:
        url = f"{base_url}{endpoint}"

        for attempt in range(retries):
            response = session.get(url, timeout=30)
            if response.status == 200:
                return json.loads(response.body)

            snippet = response.body.decode("utf-8", errors="replace")[:300] if response.body else ""
            last_error = RuntimeError(f"Fixture API error {response.status} for {endpoint}: {snippet}")
            if response.status == 403 and attempt < retries - 1:
                time.sleep(1.5 + attempt)
                continue
            break

    attempted_hosts = ", ".join(API_BASES)
    raise RuntimeError(
        f"All fixture API hosts failed for {endpoint} "
        f"(hosts: {attempted_hosts}; last error: {last_error or 'unknown error'})"
    ) from last_error


def fetch_scheduled_events(session: Any, date_iso: str) -> Dict[str, Any]:
    if use_rapidapi():
        events: List[Dict[str, Any]] = []
        for category_id in RAPIDAPI_FOOTBALL_CATEGORY_IDS:
            payload = rapidapi_get(
                f"/tournaments/get-scheduled-events?categoryId={category_id}&date={date_iso}"
            )
            category_events = payload.get("events") or []
            if isinstance(category_events, list):
                events.extend(category_events)
        return {"events": events}

    return sofa_get(session, f"/sport/football/scheduled-events/{date_iso}")


def filter_and_map_fixtures(events: List[Dict[str, Any]], kickoff_time: str = "15:00:00") -> List[Dict[str, Any]]:
    allowed_ids = set(SOFASCORE_TOURNAMENTS.keys())
    rows: List[Dict[str, Any]] = []
    target_kickoff = normalize_kickoff_time(kickoff_time)[:5]

    for event in events:
        league_id = event.get("tournament", {}).get("uniqueTournament", {}).get("id")
        if league_id not in allowed_ids:
            continue
        if event.get("status", {}).get("type") == "postponed":
            continue

        start_timestamp = event.get("startTimestamp")
        if not start_timestamp:
            continue
        kickoff_utc = dt.datetime.fromtimestamp(start_timestamp, tz=dt.timezone.utc)
        kickoff_uk = kickoff_utc.astimezone(UK_TZ)
        if kickoff_uk.strftime("%H:%M") != target_kickoff:
            continue

        home = event.get("homeTeam", {}) or {}
        away = event.get("awayTeam", {}) or {}
        status_type = event.get("status", {}).get("type")

        rows.append(
            {
                "api_fixture_id": event.get("id"),
                "home_team": home.get("name", ""),
                "away_team": away.get("name", ""),
                "home_team_id": home.get("id"),
                "away_team_id": away.get("id"),
                "home_team_logo": f"https://api.sofascore.com/api/v1/team/{home.get('id')}/image",
                "away_team_logo": f"https://api.sofascore.com/api/v1/team/{away.get('id')}/image",
                "league_id": league_id,
                "league_name": SOFASCORE_TOURNAMENTS.get(
                    league_id,
                    event.get("tournament", {}).get("uniqueTournament", {}).get("name", "Unknown"),
                ),
                "kick_off": kickoff_utc.isoformat(),
                "home_score": event.get("homeScore", {}).get("current"),
                "away_score": event.get("awayScore", {}).get("current"),
                "match_status": "FT" if status_type == "finished" else "LIVE" if status_type == "inprogress" else "NS",
                "_season_id": (event.get("season") or {}).get("id"),
                "_start_timestamp": start_timestamp,
            }
        )

    return rows


def winner_for_team(event: Dict[str, Any], team_id: int) -> str:
    winner_code = event.get("winnerCode")
    home_id = (event.get("homeTeam") or {}).get("id")
    away_id = (event.get("awayTeam") or {}).get("id")
    team_is_home = team_id == home_id
    team_is_away = team_id == away_id

    if winner_code in (None, 0):
        return "D"
    if (winner_code == 1 and team_is_home) or (winner_code == 2 and team_is_away):
        return "W"
    return "L"


def fetch_table_positions(
    session: Any, league_id: int, season_id: int | None
) -> Dict[int, int]:
    if not season_id:
        return {}

    cache_key = f"{league_id}:{season_id}"
    if cache_key in STANDINGS_CACHE:
        return STANDINGS_CACHE[cache_key]

    try:
        payload = sofa_get(session, f"/unique-tournament/{league_id}/season/{season_id}/standings/total")
        standings = payload.get("standings") or []
        rows = standings[0].get("rows") if standings else []
        out: Dict[int, int] = {}
        for row in rows or []:
            team_id = (row.get("team") or {}).get("id")
            position = row.get("position")
            if isinstance(team_id, int) and isinstance(position, int):
                out[team_id] = position
        STANDINGS_CACHE[cache_key] = out
        return out
    except Exception:
        STANDINGS_CACHE[cache_key] = {}
        return {}


def fetch_league_recent_events(
    league_id: int,
    season_id: int | None,
    max_pages: int = 2,
) -> List[Dict[str, Any]]:
    if not use_rapidapi() or not season_id:
        return []

    events: List[Dict[str, Any]] = []
    for page_index in range(max_pages):
        try:
            payload = rapidapi_get(
                f"/tournaments/get-last-matches?tournamentId={league_id}&seasonId={season_id}&pageIndex={page_index}"
            )
        except RapidApiBudgetExhausted:
            raise
        except Exception as exc:
            print(f"Failed to fetch league form for {league_id}/{season_id}: {exc}", file=sys.stderr)
            break

        page_events = payload.get("events") or []
        if isinstance(page_events, list):
            events.extend(page_events)
        if not payload.get("hasNextPage") or not page_events:
            break

    return events


def build_form(
    events: List[Dict[str, Any]],
    team_id: int,
    league_id: int,
    fixture_ts: int,
    positions_by_team: Dict[int, int] | None = None,
) -> List[Dict[str, Any]]:
    cutoff_ts = fixture_ts - (180 * 24 * 60 * 60)
    filtered = [
        e
        for e in events
        if e.get("status", {}).get("type") == "finished"
        and e.get("startTimestamp", 0) < fixture_ts
        and e.get("startTimestamp", 0) >= cutoff_ts
        and (e.get("tournament", {}).get("uniqueTournament", {}).get("id") == league_id)
    ]
    filtered.sort(key=lambda x: x.get("startTimestamp", 0), reverse=True)

    out: List[Dict[str, Any]] = []
    for event in filtered[:5]:
        home = event.get("homeTeam") or {}
        away = event.get("awayTeam") or {}
        team_is_home = home.get("id") == team_id
        opponent_id = away.get("id") if team_is_home else home.get("id")
        opponent = away.get("name") if team_is_home else home.get("name")
        score_home = (event.get("homeScore") or {}).get("current") or 0
        score_away = (event.get("awayScore") or {}).get("current") or 0
        match_date = dt.datetime.fromtimestamp(event.get("startTimestamp", 0), tz=UK_TZ)

        out.append(
            {
                "result": winner_for_team(event, team_id),
                "homeScore": score_home,
                "awayScore": score_away,
                "opponent": opponent,
                "opponentPosition": (positions_by_team or {}).get(opponent_id),
                "homeAway": "H" if team_is_home else "A",
                "date": match_date.strftime("%d/%m/%Y"),
                "competition": event.get("tournament", {}).get("uniqueTournament", {}).get("name"),
            }
        )

    return out


def extract_over_under_odds(odds_payload: Dict[str, Any]) -> tuple[str | None, str | None]:
    markets = odds_payload.get("markets") or []
    for market in markets:
        if market.get("marketName") == "Match goals" and market.get("choiceGroup") == "2.5":
            choices = market.get("choices") or []
            over = choices[0].get("fractionalValue") if len(choices) > 0 else None
            under = choices[1].get("fractionalValue") if len(choices) > 1 else None
            return over, under
    return None, None


def fractional_to_decimal(odds_value: Any) -> float | None:
    if not odds_value:
        return None

    odds_text = str(odds_value).strip()
    if not odds_text:
        return None

    try:
        if "/" in odds_text:
            numerator_text, denominator_text = odds_text.split("/", 1)
            numerator = float(numerator_text)
            denominator = float(denominator_text)
            if denominator == 0:
                return None
            return (numerator / denominator) + 1.0
        return float(odds_text)
    except Exception:
        return None


def recent_goals_average(form_rows: List[Dict[str, Any]]) -> float | None:
    if not form_rows:
        return None

    totals: List[float] = []
    for match in form_rows:
        home_score = match.get("homeScore")
        away_score = match.get("awayScore")
        if isinstance(home_score, (int, float)) and isinstance(away_score, (int, float)):
            totals.append(float(home_score + away_score))

    if not totals:
        return None
    return sum(totals) / len(totals)


def _normalize(value: float | None, min_value: float | None, max_value: float | None, invert: bool = False) -> float:
    # Unknown values get a neutral midpoint so they can still rank.
    if value is None or min_value is None or max_value is None:
        return 0.5
    if max_value <= min_value:
        return 1.0

    normalized = (value - min_value) / (max_value - min_value)
    if invert:
        normalized = 1.0 - normalized
    return max(0.0, min(1.0, normalized))


def apply_star_rankings(rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return

    ranking_rows: List[Dict[str, Any]] = []
    odds_values: List[float] = []
    goals_values: List[float] = []

    for row in rows:
        odds_decimal = fractional_to_decimal(row.get("odds_over_25"))
        home_avg_goals = recent_goals_average(row.get("home_form") or [])
        away_avg_goals = recent_goals_average(row.get("away_form") or [])
        team_goal_avgs = [v for v in (home_avg_goals, away_avg_goals) if v is not None]
        combined_goals_avg = (sum(team_goal_avgs) / len(team_goal_avgs)) if team_goal_avgs else None

        if odds_decimal is not None:
            odds_values.append(odds_decimal)
        if combined_goals_avg is not None:
            goals_values.append(combined_goals_avg)

        ranking_rows.append(
            {
                "row": row,
                "odds_decimal": odds_decimal,
                "goals_avg": combined_goals_avg,
            }
        )

    odds_min = min(odds_values) if odds_values else None
    odds_max = max(odds_values) if odds_values else None
    goals_min = min(goals_values) if goals_values else None
    goals_max = max(goals_values) if goals_values else None

    for item in ranking_rows:
        odds_score = _normalize(item["odds_decimal"], odds_min, odds_max, invert=True)
        goals_score = _normalize(item["goals_avg"], goals_min, goals_max, invert=False)
        # Favor lower over-2.5 odds slightly more, then recent goals trend.
        score = (odds_score * 0.6) + (goals_score * 0.4)
        item["score"] = score

        row = item["row"]
        row["is_star_pick"] = False
        row["star_rank"] = None
        row["star_score"] = round(score, 4)

    ranking_rows.sort(
        key=lambda item: (
            item["score"],
            item["goals_avg"] if item["goals_avg"] is not None else -1.0,
            -(item["odds_decimal"] if item["odds_decimal"] is not None else 999.0),
        ),
        reverse=True,
    )

    star_count = min(5, len(ranking_rows))
    for i in range(star_count):
        row = ranking_rows[i]["row"]
        row["is_star_pick"] = True
        row["star_rank"] = i + 1


def enrich_fixture_row(session: Any, row: Dict[str, Any], include_odds: bool) -> None:
    fixture_id = row.get("api_fixture_id")
    home_team_id = row.get("home_team_id")
    away_team_id = row.get("away_team_id")
    league_id = row.get("league_id")

    if not fixture_id or not home_team_id or not away_team_id or not league_id:
        set_default_insights(row)
        return

    fixture_data = sofa_get(session, f"/event/{fixture_id}")
    fixture_event = fixture_data.get("event") or {}
    fixture_ts = fixture_event.get("startTimestamp") or int(dt.datetime.now(dt.timezone.utc).timestamp())
    season_id = (fixture_event.get("season") or {}).get("id")
    positions_by_team = fetch_table_positions(session, int(league_id), season_id)
    row["home_team_position"] = positions_by_team.get(int(home_team_id))
    row["away_team_position"] = positions_by_team.get(int(away_team_id))

    home_events = sofa_get(session, f"/team/{home_team_id}/events/last/0").get("events") or []
    away_events = sofa_get(session, f"/team/{away_team_id}/events/last/0").get("events") or []

    row["home_form"] = build_form(
        home_events,
        int(home_team_id),
        int(league_id),
        int(fixture_ts),
        positions_by_team,
    )
    row["away_form"] = build_form(
        away_events,
        int(away_team_id),
        int(league_id),
        int(fixture_ts),
        positions_by_team,
    )

    row["odds_over_25"] = None
    row["odds_under_25"] = None
    if include_odds:
        # Odds are often unavailable (404) until closer to kickoff; keep form data even when odds are missing.
        try:
            odds_payload = sofa_get(session, f"/event/{fixture_id}/odds/1/all")
            over, under = extract_over_under_odds(odds_payload)
            row["odds_over_25"] = over
            row["odds_under_25"] = under
        except Exception as exc:
            if " 404 " in str(exc) or "error 404" in str(exc).lower():
                row["odds_over_25"] = None
                row["odds_under_25"] = None
            else:
                raise

    row["insights_updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()


def apply_bulk_enrichment(session: Any, rows: List[Dict[str, Any]], include_odds: bool) -> None:
    for row in rows:
        set_default_insights(row)

    grouped: Dict[tuple[int, int | None], List[Dict[str, Any]]] = {}
    for row in rows:
        league_id = row.get("league_id")
        if not isinstance(league_id, int):
            continue
        grouped.setdefault((league_id, row.get("_season_id")), []).append(row)

    for (league_id, season_id), league_rows in grouped.items():
        try:
            positions_by_team = fetch_table_positions(session, league_id, season_id)
        except RapidApiBudgetExhausted:
            print("Request budget exhausted while fetching standings; skipping remaining form/position enrichment.", file=sys.stderr)
            break

        try:
            league_events = fetch_league_recent_events(league_id, season_id)
        except RapidApiBudgetExhausted:
            print("Request budget exhausted while fetching league form; using standings collected so far.", file=sys.stderr)
            league_events = []

        for row in league_rows:
            home_team_id = row.get("home_team_id")
            away_team_id = row.get("away_team_id")
            fixture_ts = row.get("_start_timestamp") or int(dt.datetime.now(dt.timezone.utc).timestamp())

            if isinstance(home_team_id, int):
                row["home_team_position"] = positions_by_team.get(home_team_id)
                row["home_form"] = build_form(
                    league_events,
                    home_team_id,
                    league_id,
                    int(fixture_ts),
                    positions_by_team,
                )
            if isinstance(away_team_id, int):
                row["away_team_position"] = positions_by_team.get(away_team_id)
                row["away_form"] = build_form(
                    league_events,
                    away_team_id,
                    league_id,
                    int(fixture_ts),
                    positions_by_team,
                )
            row["insights_updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()

    apply_star_rankings(rows)

    if not include_odds:
        return

    odds_candidates = sorted(
        rows,
        key=lambda row: (
            row.get("star_score") if isinstance(row.get("star_score"), (int, float)) else -1,
            row.get("api_fixture_id") or 0,
        ),
        reverse=True,
    )
    for row in odds_candidates:
        fixture_id = row.get("api_fixture_id")
        if not fixture_id:
            continue
        try:
            odds_payload = sofa_get(session, f"/event/{fixture_id}/odds/1/all")
            over, under = extract_over_under_odds(odds_payload)
            row["odds_over_25"] = over
            row["odds_under_25"] = under
        except RapidApiBudgetExhausted:
            print("Request budget exhausted while fetching odds; remaining fixtures keep odds empty.", file=sys.stderr)
            break
        except Exception as exc:
            if " 404 " in str(exc) or "error 404" in str(exc).lower():
                row["odds_over_25"] = None
                row["odds_under_25"] = None
            else:
                print(f"Failed to fetch odds for fixture {fixture_id}: {exc}", file=sys.stderr)
        row["insights_updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()

    apply_star_rankings(rows)


def strip_internal_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in row.items() if not key.startswith("_")}


class SupabaseRest:
    def __init__(self, base_url: str, service_role_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
            }
        )

    def upsert_week(
        self,
        saturday_date: str,
        season: str,
        week_number: int,
        target_date: str,
        target_kickoff_time: str,
        is_custom: bool,
    ) -> Dict[str, Any]:
        payload = [
            {
                "week_number": week_number,
                "season": season,
                "saturday_date": saturday_date,
                "target_date": target_date,
                "target_kickoff_time": target_kickoff_time,
                "is_custom": is_custom,
                "status": "active",
            }
        ]
        headers = {"Prefer": "resolution=merge-duplicates,return=representation"}
        upsert_url = f"{self.base_url}/rest/v1/weeks?on_conflict=season,week_number,is_custom"
        res = self.session.post(upsert_url, data=json.dumps(payload), headers=headers, timeout=30)
        if res.status_code >= 300:
            raise RuntimeError(f"Failed to upsert week: {res.status_code} {res.text[:300]}")

        query_url = f"{self.base_url}/rest/v1/weeks"
        query_params = {
            "season": f"eq.{season}",
            "week_number": f"eq.{week_number}",
            "is_custom": f"eq.{str(is_custom).lower()}",
            "select": "*",
        }
        query = self.session.get(query_url, params=query_params, timeout=30)
        if query.status_code >= 300:
            raise RuntimeError(f"Failed to fetch week after upsert: {query.status_code} {query.text[:300]}")
        data = query.json()
        if not data:
            raise RuntimeError("Week upsert succeeded but week row was not found.")
        return data[0]

    def upsert_fixtures(self, rows: List[Dict[str, Any]]) -> None:
        if not rows:
            return
        headers = {"Prefer": "resolution=merge-duplicates,return=minimal"}
        url = f"{self.base_url}/rest/v1/fixtures?on_conflict=api_fixture_id"
        res = self.session.post(url, data=json.dumps(rows), headers=headers, timeout=120)
        if res.status_code >= 300:
            raise RuntimeError(f"Failed to upsert fixtures: {res.status_code} {res.text[:300]}")

    def update_week_request_usage(self, week_id: int, request_budget: int | None, requests_used: int) -> None:
        payload = {
            "rapidapi_request_budget": request_budget,
            "rapidapi_requests_used": requests_used,
        }
        url = f"{self.base_url}/rest/v1/weeks"
        res = self.session.patch(url, params={"id": f"eq.{week_id}"}, data=json.dumps(payload), timeout=30)
        if res.status_code >= 300:
            if "rapidapi_request_budget" in res.text or "rapidapi_requests_used" in res.text:
                print(
                    "Could not store RapidAPI request usage. Run supabase/migrations/add_week_request_usage.sql.",
                    file=sys.stderr,
                )
                return
            raise RuntimeError(f"Failed to update week request usage: {res.status_code} {res.text[:300]}")


def main() -> int:
    args = parse_args()
    week_offset = max(0, int(args.weekOffset))

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role:
        raise SystemExit(
            "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in environment."
        )

    is_custom = parse_bool(args.isCustom, bool(args.targetDate and args.kickoffTime))
    enrich = parse_bool(args.enrich, enrich_fixtures_enabled())
    enrich_odds = parse_bool(args.enrichOdds, enrich_odds_enabled())
    request_budget = max(1, args.requestBudget) if args.requestBudget else request_budget_default()
    configure_rapidapi_budget(request_budget if use_rapidapi() else None)
    target_date = args.targetDate or get_relevant_saturday(week_offset)
    target_kickoff_time = normalize_kickoff_time(args.kickoffTime or "15:00:00")
    saturday_date = get_saturday_for_target_date(target_date) if is_custom else get_relevant_saturday(week_offset)
    season = get_current_season()
    week_number = calculate_week_number(saturday_date)
    print(
        f"Fetching fixtures for target_date={target_date}, kickoff={target_kickoff_time}, "
        f"saturday={saturday_date}, weekOffset={week_offset}, isCustom={is_custom}, "
        f"source={'RapidAPI' if use_rapidapi() else 'SofaScore direct'}, enrich={enrich}, "
        f"enrichOdds={enrich_odds}, requestBudget={request_budget if use_rapidapi() else 'unlimited'}"
    )

    tls_session_factory = get_tls_session()
    with tls_session_factory as tls_session:
        sofa_payload = fetch_scheduled_events(tls_session, target_date)
        fixture_rows = filter_and_map_fixtures(sofa_payload.get("events", []), target_kickoff_time)
        print(f"Found {len(fixture_rows)} matching fixtures")

        if not fixture_rows:
            return 0

        if enrich:
            apply_bulk_enrichment(tls_session, fixture_rows, enrich_odds)
        else:
            for row in fixture_rows:
                set_default_insights(row)

    star_rows = [row for row in fixture_rows if row.get("is_star_pick")]
    print(f"Calculated star picks: {len(star_rows)} / {len(fixture_rows)} fixtures")

    supabase = SupabaseRest(supabase_url, service_role)
    week = supabase.upsert_week(
        saturday_date=saturday_date,
        season=season,
        week_number=week_number,
        target_date=target_date,
        target_kickoff_time=target_kickoff_time,
        is_custom=is_custom,
    )

    for row in fixture_rows:
        row["week_id"] = week["id"]

    fixture_rows = [strip_internal_fields(row) for row in fixture_rows]
    supabase.upsert_fixtures(fixture_rows)
    supabase.update_week_request_usage(
        week_id=week["id"],
        request_budget=request_budget if use_rapidapi() else None,
        requests_used=RAPIDAPI_REQUESTS_USED if use_rapidapi() else 0,
    )
    print(
        f"Stored/updated {len(fixture_rows)} fixtures (with insights) for "
        f"week {week['week_number']}{'.5' if week.get('is_custom') else ''}. "
        f"RapidAPI requests used: {RAPIDAPI_REQUESTS_USED}/{request_budget if use_rapidapi() else 'unlimited'}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)

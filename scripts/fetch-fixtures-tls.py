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
import math
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
BSD_API_BASE = "https://sports.bzzoiro.com/api/v2"
DEFAULT_RETRIES = 3
BSD_RETRIES = 5
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


def canonical_league_name(value: str) -> str:
    name = " ".join((value or "").lower().replace("sky bet", "").split())
    aliases = {
        "english premier league": "Premier League",
        "premier league": "Premier League",
        "efl championship": "Championship",
        "championship": "Championship",
        "efl league one": "League One",
        "league one": "League One",
        "efl league two": "League Two",
        "league two": "League Two",
        "national league": "National League",
        "fa cup": "FA Cup",
        "scottish cup": "Scottish Cup",
        "scottish premiership": "Scottish Premiership",
        "scottish championship": "Scottish Championship",
        "scottish league one": "Scottish League One",
        "scottish league two": "Scottish League Two",
    }
    return aliases.get(name, value)


def bsd_token() -> str:
    # bsd_event_id is retained temporarily for existing local environments.
    token = os.getenv("BZZOIRO_API_TOKEN") or os.getenv("bsd_event_id")
    if not token:
        raise RuntimeError("BZZOIRO_API_TOKEN environment variable is not set")
    return token


def bsd_get(path: str, params: Dict[str, Any] | None = None) -> Dict[str, Any]:
    url = f"{BSD_API_BASE}{path}"
    headers = {"Authorization": f"Token {bsd_token()}", "Accept": "application/json"}
    last_error: Exception | None = None
    for attempt in range(1, BSD_RETRIES + 1):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=(10, 45))
        except requests.RequestException as exc:
            last_error = RuntimeError(f"BSD request error for {path}: {exc}")
            if attempt == BSD_RETRIES:
                break
            delay = min(12.0, 2.0 ** attempt)
            print(
                f"BSD request failed for {path} ({exc.__class__.__name__}); "
                f"retrying in {delay:.0f}s ({attempt}/{BSD_RETRIES})",
                file=sys.stderr,
                flush=True,
            )
            time.sleep(delay)
            continue

        if response.status_code == 200:
            return response.json()
        last_error = RuntimeError(f"BSD API error {response.status_code} for {path}: {response.text[:300]}")
        if response.status_code in {429, 500, 502, 503, 504} and attempt < BSD_RETRIES:
            retry_after = response.headers.get("Retry-After")
            try:
                delay = max(0.0, float(retry_after)) if retry_after else min(12.0, 2.0 ** attempt)
            except ValueError:
                delay = min(12.0, 2.0 ** attempt)
            print(
                f"BSD returned HTTP {response.status_code} for {path}; "
                f"retrying in {delay:.0f}s ({attempt}/{BSD_RETRIES})",
                file=sys.stderr,
                flush=True,
            )
            time.sleep(delay)
            continue
        break
    raise last_error or RuntimeError(f"BSD API request failed for {path}")

STANDINGS_CACHE: Dict[str, Dict[int, int]] = {}
BSD_FORM_CACHE: Dict[str, List[Dict[str, Any]]] = {}
BSD_STANDINGS_CACHE: Dict[str, Dict[int, int]] = {}
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
    row["over_25_prediction"] = None
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
    parser.add_argument("--bsdOnly", type=str, help="Refresh BSD fixtures only and leave fallback fixtures untouched")
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
                "data_provider": "sofascore",
                "provider_fixture_id": event.get("id"),
                "bsd_event_id": None,
                "bsd_live_websocket": False,
                "bsd_websocket_plus": False,
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


def _list_payload(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = payload.get("results") or payload.get("events") or payload.get("data") or []
    return rows if isinstance(rows, list) else []


def fetch_bsd_supported_leagues() -> Dict[str, int]:
    supported: Dict[str, int] = {}
    offset = 0
    while True:
        payload = bsd_get("/leagues/", {"limit": 100, "offset": offset})
        rows = _list_payload(payload)
        for league in rows:
            canonical = canonical_league_name(str(league.get("name") or league.get("league_name") or ""))
            if canonical in SOFASCORE_TOURNAMENTS.values() and league.get("id") is not None:
                supported[canonical] = int(league["id"])
        if not payload.get("next") or not rows:
            break
        offset += len(rows)
    return supported


def _bsd_status(value: Any) -> str:
    status = str(value or "notstarted").lower().replace("_", "")
    if status in {"finished", "ft", "ended"}:
        return "FT"
    if status in {"inprogress", "live", "halftime", "paused"}:
        return "LIVE"
    if status in {"postponed", "cancelled", "canceled"}:
        return "PST"
    return "NS"


def fetch_bsd_fixtures(date_iso: str, kickoff_time: str, supported: Dict[str, int]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    target_kickoff = normalize_kickoff_time(kickoff_time)[:5]
    events: List[Dict[str, Any]] = []
    for league_id in supported.values():
        offset = 0
        while True:
            payload = bsd_get("/events/", {
                "date_from": date_iso, "date_to": date_iso, "league_id": league_id,
                "limit": 100, "offset": offset,
            })
            page = _list_payload(payload)
            events.extend(page)
            if not payload.get("next") or not page:
                break
            offset += len(page)
    for event in events:
        league_id = event.get("league_id") or (event.get("league") or {}).get("id")
        if league_id is None:
            continue
        raw_date = event.get("event_date") or event.get("start_time") or event.get("kickoff")
        if not raw_date:
            continue
        kickoff_utc = dt.datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
        if kickoff_utc.tzinfo is None:
            kickoff_utc = kickoff_utc.replace(tzinfo=dt.timezone.utc)
        if kickoff_utc.astimezone(UK_TZ).strftime("%H:%M") != target_kickoff:
            continue
        home = event.get("home_team")
        away = event.get("away_team")
        home_obj = home if isinstance(home, dict) else {}
        away_obj = away if isinstance(away, dict) else {}
        league_name = next((name for name, lid in supported.items() if lid == int(league_id)), str(event.get("league_name") or "Unknown"))
        event_id = int(event["id"])
        row = {
            "api_fixture_id": event_id,
            "data_provider": "bsd",
            "provider_fixture_id": event_id,
            "bsd_event_id": event_id,
            "home_team": home_obj.get("name") or home or event.get("home_team_name") or "",
            "away_team": away_obj.get("name") or away or event.get("away_team_name") or "",
            "home_team_id": home_obj.get("id") or event.get("home_team_id"),
            "away_team_id": away_obj.get("id") or event.get("away_team_id"),
            "home_team_logo": home_obj.get("logo") or event.get("home_team_logo"),
            "away_team_logo": away_obj.get("logo") or event.get("away_team_logo"),
            "league_id": int(league_id),
            "league_name": league_name,
            "kick_off": kickoff_utc.astimezone(dt.timezone.utc).isoformat(),
            "home_score": event.get("home_score"),
            "away_score": event.get("away_score"),
            "match_status": _bsd_status(event.get("status")),
            "bsd_live_websocket": bool(event.get("live_websocket")),
            "bsd_websocket_plus": bool(event.get("websocket_plus")),
            "_season_id": event.get("season_id"),
        }
        set_default_insights(row)
        rows.append(row)
    return rows


def _find_number(node: Any, wanted: set[str]) -> float | None:
    if isinstance(node, dict):
        for key, value in node.items():
            normalized = str(key).lower().replace("-", "_").replace(".", "_")
            if normalized in wanted and isinstance(value, (int, float, str)):
                try:
                    return float(value)
                except ValueError:
                    pass
        for value in node.values():
            found = _find_number(value, wanted)
            if found is not None:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _find_number(value, wanted)
            if found is not None:
                return found
    return None


def fetch_bsd_team_form(
    team_id: int,
    league_id: int,
    fixture_date: str,
    league_name: str,
) -> List[Dict[str, Any]]:
    cache_key = f"{team_id}:{league_id}:{fixture_date}"
    if cache_key in BSD_FORM_CACHE:
        return BSD_FORM_CACHE[cache_key]

    payload = bsd_get("/events/", {
        "team_id": team_id,
        "league_id": league_id,
        "status": "finished",
        "date_to": fixture_date,
        "limit": 10,
        "offset": 0,
    })
    events = _list_payload(payload)
    events.sort(key=lambda event: str(event.get("event_date") or ""), reverse=True)
    form: List[Dict[str, Any]] = []
    for event in events:
        if int(event.get("league_id") or 0) != league_id:
            continue
        home_id = event.get("home_team_id")
        away_id = event.get("away_team_id")
        if team_id not in {home_id, away_id}:
            continue
        home_score = int(event.get("home_score") or 0)
        away_score = int(event.get("away_score") or 0)
        team_is_home = home_id == team_id
        team_score = home_score if team_is_home else away_score
        opponent_score = away_score if team_is_home else home_score
        result = "W" if team_score > opponent_score else "L" if team_score < opponent_score else "D"
        raw_date = str(event.get("event_date") or "")
        try:
            match_date = dt.datetime.fromisoformat(raw_date.replace("Z", "+00:00")).strftime("%d/%m/%Y")
        except ValueError:
            match_date = raw_date[:10]
        form.append({
            "result": result,
            "homeScore": home_score,
            "awayScore": away_score,
            "opponent": event.get("away_team") if team_is_home else event.get("home_team"),
            "opponentPosition": None,
            "homeAway": "H" if team_is_home else "A",
            "date": match_date,
            "competition": league_name,
        })
        if len(form) == 5:
            break

    BSD_FORM_CACHE[cache_key] = form
    return form


def fetch_bsd_positions(league_id: int, season_id: int | None) -> Dict[int, int]:
    if not season_id:
        return {}
    cache_key = f"{league_id}:{season_id}"
    if cache_key in BSD_STANDINGS_CACHE:
        return BSD_STANDINGS_CACHE[cache_key]
    payload = bsd_get(f"/leagues/{league_id}/standings/", {"season_id": season_id})
    standings = payload.get("standings") or payload.get("results") or []
    positions: Dict[int, int] = {}
    for item in standings if isinstance(standings, list) else []:
        team = item.get("team") if isinstance(item.get("team"), dict) else {}
        team_id = item.get("team_id") or team.get("id")
        position = item.get("position") or item.get("rank")
        if team_id is not None and position is not None:
            positions[int(team_id)] = int(position)
    BSD_STANDINGS_CACHE[cache_key] = positions
    return positions


def enrich_bsd_fixtures(rows: List[Dict[str, Any]]) -> None:
    for row in rows:
        event_id = int(row["bsd_event_id"])
        fixture_date = str(row.get("kick_off") or "")[:10]
        try:
            positions = fetch_bsd_positions(int(row["league_id"]), row.get("_season_id"))
            row["home_team_position"] = positions.get(int(row["home_team_id"])) if row.get("home_team_id") else None
            row["away_team_position"] = positions.get(int(row["away_team_id"])) if row.get("away_team_id") else None
        except Exception as exc:
            print(f"BSD standings unavailable for league {row['league_id']}: {exc}", file=sys.stderr)
        for side in ("home", "away"):
            team_id = row.get(f"{side}_team_id")
            if not team_id:
                continue
            try:
                row[f"{side}_form"] = fetch_bsd_team_form(
                    int(team_id), int(row["league_id"]), fixture_date, str(row["league_name"])
                )
            except Exception as exc:
                print(f"BSD form unavailable for team {team_id}: {exc}", file=sys.stderr)
        try:
            prediction = bsd_get(f"/events/{event_id}/prediction/")
            probability = _find_number(prediction, {"prob_over_25", "over_25_probability"})
            row["over_25_prediction"] = probability
            markets = prediction.get("markets") or (prediction.get("prediction") or {}).get("markets") or {}
            expected_goals = markets.get("expected_goals") or {}
            expected_home = _find_number(expected_goals, {"home"})
            expected_away = _find_number(expected_goals, {"away"})
            row["_expected_total_goals"] = (
                expected_home + expected_away
                if expected_home is not None and expected_away is not None
                else None
            )
        except Exception as exc:
            print(f"BSD prediction unavailable for {event_id}: {exc}", file=sys.stderr)
        try:
            odds = bsd_get("/odds/", {"event_id": event_id, "market": "over_under_25", "limit": 100})
            odds_rows = _list_payload(odds)
            consensus = [item for item in odds_rows if item.get("bookmaker_slug") == "consensus"] or odds_rows
            over = next((item.get("decimal_odds") for item in consensus if str(item.get("outcome")).lower() == "over"), None)
            under = next((item.get("decimal_odds") for item in consensus if str(item.get("outcome")).lower() == "under"), None)
            row["odds_over_25"] = float(over) if over is not None else None
            row["odds_under_25"] = float(under) if under is not None else None
        except Exception as exc:
            print(f"BSD odds unavailable for {event_id}: {exc}", file=sys.stderr)
        row["insights_updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()

    apply_bsd_star_rankings(rows)


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


def recent_over_25_rate(form_rows: List[Dict[str, Any]]) -> float | None:
    totals = [
        float(match["homeScore"] + match["awayScore"])
        for match in form_rows
        if isinstance(match.get("homeScore"), (int, float))
        and isinstance(match.get("awayScore"), (int, float))
    ]
    if not totals:
        return None
    return sum(total > 2.5 for total in totals) / len(totals)


def over_25_probability_from_mean(goals_mean: float | None) -> float | None:
    if goals_mean is None or goals_mean < 0:
        return None
    # Poisson estimate of three or more goals from an expected/observed goal mean.
    return 1.0 - math.exp(-goals_mean) * (1.0 + goals_mean + (goals_mean ** 2 / 2.0))


def market_over_25_probability(over_odds: Any, under_odds: Any) -> float | None:
    over_decimal = fractional_to_decimal(over_odds)
    under_decimal = fractional_to_decimal(under_odds)
    if not over_decimal or not under_decimal or over_decimal <= 1 or under_decimal <= 1:
        return None
    over_implied = 1.0 / over_decimal
    under_implied = 1.0 / under_decimal
    return over_implied / (over_implied + under_implied)


def apply_bsd_star_rankings(rows: List[Dict[str, Any]]) -> None:
    ranked: List[Dict[str, Any]] = []
    for row in rows:
        home_form = row.get("home_form") or []
        away_form = row.get("away_form") or []
        combined_form = home_form + away_form
        recent_average = recent_goals_average(combined_form)
        raw_prediction = row.get("over_25_prediction")
        prediction_probability = (
            max(0.0, min(1.0, float(raw_prediction) / (100.0 if float(raw_prediction) > 1 else 1.0)))
            if isinstance(raw_prediction, (int, float)) else None
        )

        components = [
            (0.55, prediction_probability),
            (0.15, over_25_probability_from_mean(row.get("_expected_total_goals"))),
            (0.10, over_25_probability_from_mean(recent_average)),
            (0.10, recent_over_25_rate(combined_form)),
            (0.10, market_over_25_probability(row.get("odds_over_25"), row.get("odds_under_25"))),
        ]
        available = [(weight, value) for weight, value in components if value is not None]
        row["is_star_pick"] = False
        row["star_rank"] = None
        row["star_score"] = (
            round(100.0 * sum(weight * value for weight, value in available) / sum(weight for weight, _ in available), 2)
            if available else None
        )
        # BSD's prediction remains the required primary signal; the other inputs
        # confirm and refine it rather than creating picks without model coverage.
        if row["star_score"] is not None and prediction_probability is not None:
            ranked.append(row)

    ranked.sort(key=lambda row: (row["star_score"], -int(row["bsd_event_id"])), reverse=True)
    for rank, row in enumerate(ranked[:5], 1):
        row["is_star_pick"] = True
        row["star_rank"] = rank


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

    def find_week(
        self,
        season: str,
        week_number: int,
        is_custom: bool,
    ) -> Dict[str, Any] | None:
        url = f"{self.base_url}/rest/v1/weeks"
        params = {
            "season": f"eq.{season}",
            "week_number": f"eq.{week_number}",
            "is_custom": f"eq.{str(is_custom).lower()}",
            "select": "*",
            "limit": "1",
        }
        res = self.session.get(url, params=params, timeout=30)
        if res.status_code >= 300:
            return None
        data = res.json()
        return data[0] if data else None

    def get_week_fixture_enrichment_status(self, week_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/rest/v1/fixtures"
        params = {
            "week_id": f"eq.{week_id}",
            "select": "id,insights_updated_at,home_form,away_form,home_team_position,away_team_position,odds_over_25,odds_under_25",
        }
        res = self.session.get(url, params=params, timeout=45)
        if res.status_code >= 300:
            raise RuntimeError(f"Failed to inspect existing fixtures: {res.status_code} {res.text[:300]}")
        fixtures = res.json()
        fixture_count = len(fixtures)
        enriched_count = 0
        odds_count = 0

        for fixture in fixtures:
            has_form = fixture.get("home_form") is not None and fixture.get("away_form") is not None
            has_insights = fixture.get("insights_updated_at") is not None
            if has_insights and has_form:
                enriched_count += 1

            if fixture.get("odds_over_25") is not None or fixture.get("odds_under_25") is not None:
                odds_count += 1

        return {
            "fixture_count": fixture_count,
            "enriched_count": enriched_count,
            "odds_count": odds_count,
        }

    def get_week_bsd_event_ids(self, week_id: int) -> set[int]:
        url = f"{self.base_url}/rest/v1/fixtures"
        params = {
            "week_id": f"eq.{week_id}",
            "data_provider": "eq.bsd",
            "select": "bsd_event_id",
        }
        res = self.session.get(url, params=params, timeout=45)
        if res.status_code >= 300:
            raise RuntimeError(f"Failed to inspect BSD fixtures: {res.status_code} {res.text[:300]}")
        return {int(row["bsd_event_id"]) for row in res.json() if row.get("bsd_event_id") is not None}

    def should_skip_existing_round(
        self,
        season: str,
        week_number: int,
        is_custom: bool,
        require_enrichment: bool,
        require_odds: bool,
    ) -> tuple[bool, Dict[str, Any] | None, Dict[str, Any]]:
        week = self.find_week(season, week_number, is_custom)
        if not week:
            return False, None, {"reason": "week_not_found"}

        status = self.get_week_fixture_enrichment_status(int(week["id"]))
        fixture_count = int(status["fixture_count"])
        if fixture_count == 0:
            return False, week, {**status, "reason": "no_fixtures"}

        enrichment_ok = (not require_enrichment) or int(status["enriched_count"]) >= fixture_count
        odds_ok = (not require_odds) or int(status["odds_count"]) >= fixture_count

        return enrichment_ok and odds_ok, week, {
            **status,
            "enrichment_ok": enrichment_ok,
            "odds_ok": odds_ok,
        }

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
        url = f"{self.base_url}/rest/v1/fixtures?on_conflict=data_provider,provider_fixture_id"
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
    bsd_only = parse_bool(args.bsdOnly, False)
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
        f"enrichOdds={enrich_odds}, bsdOnly={bsd_only}, requestBudget={request_budget if use_rapidapi() else 'unlimited'}"
    )

    supabase = SupabaseRest(supabase_url, service_role)
    supported_bsd = fetch_bsd_supported_leagues()
    print(
        "BSD currently supports tracked leagues: "
        + (", ".join(sorted(supported_bsd)) if supported_bsd else "none")
    )
    bsd_rows = fetch_bsd_fixtures(target_date, target_kickoff_time, supported_bsd)
    if bsd_only:
        existing_week = supabase.find_week(season, week_number, is_custom)
        if not existing_week:
            print("BSD-only refresh skipped because the round does not exist yet")
            return 0
        existing_bsd_ids = supabase.get_week_bsd_event_ids(int(existing_week["id"]))
        bsd_rows = [row for row in bsd_rows if int(row["bsd_event_id"]) in existing_bsd_ids]
    enrich_bsd_fixtures(bsd_rows)

    if bsd_only:
        fixture_rows = bsd_rows
        print(f"BSD-only refresh found {len(bsd_rows)} fixtures; SofaScore fallback was not requested")
    else:
        tls_session_factory = get_tls_session()
        with tls_session_factory as tls_session:
            sofa_payload = fetch_scheduled_events(tls_session, target_date)
            sofa_rows = filter_and_map_fixtures(sofa_payload.get("events", []), target_kickoff_time)
            # The catalogue is checked on every run. As BSD adds a tracked league,
            # its SofaScore fixtures disappear from this fallback automatically.
            # Only switch a league when BSD also supplies fixtures at the requested
            # kickoff, otherwise a newly listed or temporarily incomplete feed could
            # remove the league from both sources.
            bsd_leagues_with_fixtures = {row["league_name"] for row in bsd_rows}
            pending_bsd_leagues = set(supported_bsd) - bsd_leagues_with_fixtures
            if pending_bsd_leagues:
                print(
                    "BSD-listed leagues retaining SofaScore fallback (no matching fixtures): "
                    + ", ".join(sorted(pending_bsd_leagues))
                )
            sofa_rows = [row for row in sofa_rows if row["league_name"] not in bsd_leagues_with_fixtures]
            if sofa_rows:
                # Fallback leagues still need their recent form and positions. This
                # uses league-level calls only; odds and old SofaScore star ranking
                # are deliberately discarded so BSD remains the sole star source.
                apply_bulk_enrichment(tls_session, sofa_rows, include_odds=False)
                for row in sofa_rows:
                    row["is_star_pick"] = False
                    row["star_rank"] = None
                    row["star_score"] = None
            fixture_rows = bsd_rows + sofa_rows
            print(f"Found {len(bsd_rows)} BSD + {len(sofa_rows)} SofaScore fallback fixtures")

    if not fixture_rows:
        return 0

    star_rows = [row for row in fixture_rows if row.get("is_star_pick")]
    print(f"BSD prediction star picks: {len(star_rows)} / {len(bsd_rows)} BSD fixtures")

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
    if not bsd_only:
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

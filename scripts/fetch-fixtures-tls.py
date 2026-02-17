#!/usr/bin/env python3
"""
Fetch SofaScore fixtures with browser-like TLS fingerprinting and upsert into Supabase.

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
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

import requests

try:
    import tls_client
except ImportError as exc:
    raise SystemExit(
        "Missing Python dependency for TLS client "
        f"({exc}). Install with: pip3 install -r scripts/requirements-tls.txt"
    ) from exc


API_BASE = "https://api.sofascore.com/api/v1"
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weekOffset", type=int, default=1, help="0=current week, 1=next week")
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


def get_tls_session() -> tls_client.Session:
    # Use a modern Chrome fingerprint. This is the key difference vs plain requests/fetch.
    return tls_client.Session(
        client_identifier="chrome_120",
        random_tls_extension_order=True,
    )


def fetch_scheduled_events(session: tls_client.Session, date_iso: str) -> Dict[str, Any]:
    url = f"{API_BASE}/sport/football/scheduled-events/{date_iso}"
    headers = {
        "Accept": "*/*",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        "Origin": "https://www.sofascore.com",
        "Referer": "https://www.sofascore.com/",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
    }
    response = session.get(url, headers=headers, timeout_seconds=30)
    if response.status_code != 200:
        snippet = response.text[:300] if response.text else ""
        raise RuntimeError(f"SofaScore error {response.status_code}: {snippet}")
    return json.loads(response.text)


def filter_and_map_fixtures(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    allowed_ids = set(SOFASCORE_TOURNAMENTS.keys())
    rows: List[Dict[str, Any]] = []

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
        if kickoff_uk.strftime("%H:%M") != "15:00":
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
            }
        )

    return rows


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

    def upsert_week(self, saturday_date: str, season: str, week_number: int) -> Dict[str, Any]:
        payload = [
            {
                "week_number": week_number,
                "season": season,
                "saturday_date": saturday_date,
                "status": "active",
            }
        ]
        headers = {"Prefer": "resolution=merge-duplicates,return=representation"}
        upsert_url = f"{self.base_url}/rest/v1/weeks?on_conflict=saturday_date"
        res = self.session.post(upsert_url, data=json.dumps(payload), headers=headers, timeout=30)
        if res.status_code >= 300:
            raise RuntimeError(f"Failed to upsert week: {res.status_code} {res.text[:300]}")

        query_url = f"{self.base_url}/rest/v1/weeks"
        query_params = {"saturday_date": f"eq.{saturday_date}", "select": "*"}
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
        res = self.session.post(url, data=json.dumps(rows), headers=headers, timeout=45)
        if res.status_code >= 300:
            raise RuntimeError(f"Failed to upsert fixtures: {res.status_code} {res.text[:300]}")


def main() -> int:
    args = parse_args()
    week_offset = max(0, int(args.weekOffset))

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role:
        raise SystemExit(
            "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in environment."
        )

    saturday_date = get_relevant_saturday(week_offset)
    season = get_current_season()
    week_number = calculate_week_number(saturday_date)
    print(f"Fetching fixtures for saturday={saturday_date}, weekOffset={week_offset}")

    tls_session = get_tls_session()
    sofa_payload = fetch_scheduled_events(tls_session, saturday_date)
    fixture_rows = filter_and_map_fixtures(sofa_payload.get("events", []))
    print(f"Found {len(fixture_rows)} matching fixtures")

    if not fixture_rows:
        return 0

    supabase = SupabaseRest(supabase_url, service_role)
    week = supabase.upsert_week(
        saturday_date=saturday_date,
        season=season,
        week_number=week_number,
    )

    for row in fixture_rows:
        row["week_id"] = week["id"]

    supabase.upsert_fixtures(fixture_rows)
    print(f"Stored/updated {len(fixture_rows)} fixtures for week {week['week_number']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)

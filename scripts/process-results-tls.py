#!/usr/bin/env python3
"""
Fetch latest fixture results from SofaScore using TLS client fingerprinting,
then apply selection outcomes and fines in Supabase.

Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  python3 scripts/process-results-tls.py --weekId=123

  # Or auto-pick active week:
  python3 scripts/process-results-tls.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional

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
DEFAULT_RETRIES = 3
GOAL_THRESHOLD = 2
COMPLETED_STATUSES = {"FT", "AET", "PEN"}


def use_rapidapi() -> bool:
    return os.getenv("USE_RAPIDAPI", "true").strip().lower() != "false" and bool(os.getenv("RAPIDAPI_KEY"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weekId", type=int, default=None, help="Specific week id to process")
    return parser.parse_args()


def status_short(status_type: str) -> str:
    if status_type == "finished":
        return "FT"
    if status_type == "inprogress":
        return "LIVE"
    return "NS"


def get_tls_session() -> FetcherSession:
    return FetcherSession(impersonate="chrome", stealthy_headers=True)


def fetch_event_result_rapidapi(fixture_id: int) -> Dict[str, Any]:
    api_key = os.getenv("RAPIDAPI_KEY")
    if not api_key:
        raise RuntimeError("RAPIDAPI_KEY environment variable is not set")

    endpoint = f"/matches/detail?matchId={fixture_id}"
    headers = {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": api_key,
    }
    last_error: Exception | None = None

    for attempt in range(DEFAULT_RETRIES):
        response = requests.get(f"{RAPIDAPI_BASE}{endpoint}", headers=headers, timeout=45)
        if response.status_code == 200:
            payload = response.json()
            return payload.get("event", {})

        last_error = RuntimeError(
            f"RapidAPI result error {response.status_code} for {endpoint}: {response.text[:250]}"
        )
        if response.status_code in {429, 500, 502, 503, 504} and attempt < DEFAULT_RETRIES - 1:
            time.sleep(1.5 + attempt)
            continue
        break

    raise last_error or RuntimeError(f"RapidAPI request failed for {endpoint}")


def fetch_event_result(session: Any, fixture_id: int) -> Dict[str, Any]:
    if use_rapidapi():
        return fetch_event_result_rapidapi(fixture_id)

    headers = {
        "Accept": "*/*",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        "Origin": "https://www.sofascore.com",
        "Referer": "https://www.sofascore.com/",
    }
    last_error: Exception | None = None

    for base_url in API_BASES:
        url = f"{base_url}/event/{fixture_id}"
        for attempt in range(DEFAULT_RETRIES):
            response = session.get(url, headers=headers, timeout=30)
            if response.status == 200:
                payload = json.loads(response.body)
                return payload.get("event", {})

            snippet = response.body.decode("utf-8", errors="replace")[:250] if response.body else ""
            last_error = RuntimeError(f"Result API error {response.status} for /event/{fixture_id}: {snippet}")
            if response.status == 403 and attempt < DEFAULT_RETRIES - 1:
                time.sleep(1.5 + attempt)
                continue
            break

    attempted_hosts = ", ".join(API_BASES)
    raise RuntimeError(
        f"All result API hosts failed for /event/{fixture_id} "
        f"(hosts: {attempted_hosts}; last error: {last_error or 'unknown error'})"
    ) from last_error


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

    def get(self, table: str, params: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/rest/v1/{table}"
        res = self.session.get(url, params=params or {}, timeout=45)
        if res.status_code >= 300:
            raise RuntimeError(f"GET {table} failed: {res.status_code} {res.text[:250]}")
        return res.json()

    def patch(self, table: str, filters: Dict[str, str], payload: Dict[str, Any]) -> None:
        url = f"{self.base_url}/rest/v1/{table}"
        res = self.session.patch(url, params=filters, data=json.dumps(payload), timeout=45)
        if res.status_code >= 300:
            raise RuntimeError(f"PATCH {table} failed: {res.status_code} {res.text[:250]}")

    def delete(self, table: str, filters: Dict[str, str]) -> None:
        url = f"{self.base_url}/rest/v1/{table}"
        res = self.session.delete(url, params=filters, timeout=45)
        if res.status_code >= 300:
            raise RuntimeError(f"DELETE {table} failed: {res.status_code} {res.text[:250]}")

    def insert(self, table: str, rows: List[Dict[str, Any]]) -> None:
        if not rows:
            return
        url = f"{self.base_url}/rest/v1/{table}"
        headers = {"Prefer": "return=minimal"}
        res = self.session.post(url, data=json.dumps(rows), headers=headers, timeout=45)
        if res.status_code >= 300:
            raise RuntimeError(f"INSERT {table} failed: {res.status_code} {res.text[:250]}")


def find_week(db: SupabaseRest, week_id: Optional[int]) -> Dict[str, Any]:
    if week_id:
        rows = db.get("weeks", {"id": f"eq.{week_id}", "select": "*", "limit": "1"})
        if not rows:
            raise RuntimeError(f"Week {week_id} not found")
        return rows[0]

    rows = db.get(
        "weeks",
        {
            "status": "eq.active",
            "order": "saturday_date.desc",
            "limit": "1",
            "select": "*",
        },
    )
    if not rows:
        raise RuntimeError("No active week found")
    return rows[0]


def main() -> int:
    args = parse_args()

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role:
        raise SystemExit("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.")

    db = SupabaseRest(supabase_url, service_role)
    week = find_week(db, args.weekId)
    week_id = week["id"]
    print(
        f"[Results] Processing week {week_id} ({week['saturday_date']}) "
        f"using {'RapidAPI' if use_rapidapi() else 'SofaScore direct'}"
    )

    selections = db.get("selections", {"week_id": f"eq.{week_id}", "select": "*"})
    if not selections:
        print("[Results] No selections to process")
        return 0
    print(f"[Results] Found {len(selections)} selections")

    selected_fixture_ids = sorted({int(sel["fixture_id"]) for sel in selections if sel.get("fixture_id") is not None})
    if not selected_fixture_ids:
        print("[Results] No fixture ids found in selections")
        return 0

    in_clause = ",".join(str(fid) for fid in selected_fixture_ids)
    fixtures = db.get(
        "fixtures",
        {
            "id": f"in.({in_clause})",
            "week_id": f"eq.{week_id}",
            "select": "*",
        },
    )
    if not fixtures:
        raise RuntimeError("No selected fixtures found for week")
    print(f"[Results] Processing {len(fixtures)} selected fixtures")

    tls_session_factory = get_tls_session()
    with tls_session_factory as tls_session:
        # Refresh fixture scores/status from SofaScore
        for idx, fixture in enumerate(fixtures):
            fixture_api_id = fixture["api_fixture_id"]
            try:
                event = fetch_event_result(tls_session, fixture_api_id)
                home_score = (event.get("homeScore") or {}).get("current")
                away_score = (event.get("awayScore") or {}).get("current")
                short = status_short((event.get("status") or {}).get("type", "notstarted"))

                db.patch(
                    "fixtures",
                    {"api_fixture_id": f"eq.{fixture_api_id}"},
                    {"home_score": home_score, "away_score": away_score, "match_status": short},
                )
                print(f"[Results] Updated fixture {fixture_api_id}: {home_score}-{away_score} ({short})")
            except Exception as exc:
                print(f"[Results] Skipped fixture {fixture_api_id}: {exc}", file=sys.stderr)

            if idx < len(fixtures) - 1:
                time.sleep(1.5)

    updated_fixtures = db.get("fixtures", {"week_id": f"eq.{week_id}", "select": "*"})
    fixtures_by_id = {f["id"]: f for f in updated_fixtures}

    fine_entries: List[Dict[str, Any]] = []
    player_zero_zero: Dict[str, List[int]] = {}

    for sel in selections:
        fixture = fixtures_by_id.get(sel["fixture_id"])
        if not fixture:
            continue
        home_score = fixture.get("home_score")
        away_score = fixture.get("away_score")
        match_status = fixture.get("match_status")
        if home_score is None or away_score is None:
            continue
        if match_status not in COMPLETED_STATUSES:
            continue

        total_goals = int(home_score) + int(away_score)
        won = total_goals > GOAL_THRESHOLD

        db.patch(
            "selections",
            {"id": f"eq.{sel['id']}"},
            {"result": "won" if won else "lost", "total_goals": total_goals},
        )

        if total_goals == 0:
            fine_entries.append(
                {
                    "week_id": week_id,
                    "player_name": sel["player_name"],
                    "amount": 5,
                    "reason": f"0-0: {fixture['home_team']} vs {fixture['away_team']}",
                    "fixture_id": fixture["id"],
                }
            )
            player_zero_zero.setdefault(sel["player_name"], []).append(fixture["id"])
        elif total_goals == 1:
            fine_entries.append(
                {
                    "week_id": week_id,
                    "player_name": sel["player_name"],
                    "amount": 2,
                    "reason": f"1 goal: {fixture['home_team']} {home_score}-{away_score} {fixture['away_team']}",
                    "fixture_id": fixture["id"],
                }
            )

    # Replace two £5 zero-zero fines with one £20 penalty per player
    for player, fixture_ids in player_zero_zero.items():
        if len(fixture_ids) >= 2:
            fine_entries = [f for f in fine_entries if not (f["player_name"] == player and f["amount"] == 5)]
            fine_entries.append(
                {
                    "week_id": week_id,
                    "player_name": player,
                    "amount": 20,
                    "reason": "Both games 0-0! 💀",
                    "fixture_id": fixture_ids[0],
                }
            )

    # Replace outstanding fines for this week with newly computed fines
    db.delete("fines", {"week_id": f"eq.{week_id}", "cleared": "eq.false"})
    db.insert("fines", fine_entries)
    print(f"[Results] Applied {len(fine_entries)} fine entries")

    post = db.get("selections", {"week_id": f"eq.{week_id}", "select": "result"})
    has_selections = len(post) > 0
    all_processed = has_selections and all(item["result"] != "pending" for item in post)
    if all_processed:
        db.patch("weeks", {"id": f"eq.{week_id}"}, {"status": "completed"})
        print(f"[Results] Marked week {week_id} completed")
    else:
        print(f"[Results] Week {week_id} still has pending selections")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)

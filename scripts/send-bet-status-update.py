#!/usr/bin/env python3
"""
Build a current-week status summary from Supabase and send it to Pipedream.

Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... PIPEDREAM_STATUS_WEBHOOK_URL=... \
  python3 scripts/send-bet-status-update.py
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

import requests


UK_TZ = ZoneInfo("Europe/London")


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

    def get(self, table: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/rest/v1/{table}"
        res = self.session.get(url, params=params, timeout=45)
        if res.status_code >= 300:
            raise RuntimeError(f"GET {table} failed: {res.status_code} {res.text[:250]}")
        return res.json()


def find_target_week(db: SupabaseRest) -> Dict[str, Any] | None:
    saturday_today = dt.datetime.now(UK_TZ).date().isoformat()

    rows = db.get(
        "weeks",
        {
            "saturday_date": f"eq.{saturday_today}",
            "select": "*",
            "limit": "1",
        },
    )
    if rows:
        return rows[0]

    fallback = db.get(
        "weeks",
        {
            "status": "eq.active",
            "order": "saturday_date.desc",
            "select": "*",
            "limit": "1",
        },
    )
    if fallback:
        return fallback[0]
    return None


def main() -> int:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    webhook_url = os.getenv("PIPEDREAM_STATUS_WEBHOOK_URL") or os.getenv("SELECTIONS_COMPLETE_WEBHOOK_URL")

    if not supabase_url or not service_role:
        raise SystemExit("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.")
    if not webhook_url:
        raise SystemExit("Missing PIPEDREAM_STATUS_WEBHOOK_URL (or SELECTIONS_COMPLETE_WEBHOOK_URL).")

    db = SupabaseRest(supabase_url, service_role)
    week = find_target_week(db)
    if not week:
        print("No target week found; nothing to send.")
        return 0

    week_id = week["id"]
    selections = db.get(
        "selections",
        {
            "week_id": f"eq.{week_id}",
            "select": "id,player_name,result,total_goals,fixture_id,fixture:fixtures(*)",
            "order": "player_name.asc,created_at.asc",
        },
    )
    fines = db.get(
        "fines",
        {
            "week_id": f"eq.{week_id}",
            "select": "*",
            "order": "created_at.asc",
        },
    )

    by_player: Dict[str, Dict[str, Any]] = {}
    for sel in selections:
        name = sel["player_name"]
        if name not in by_player:
            by_player[name] = {"wins": 0, "losses": 0, "pending": 0, "picks": []}

        result = sel.get("result")
        if result == "won":
            by_player[name]["wins"] += 1
        elif result == "lost":
            by_player[name]["losses"] += 1
        else:
            by_player[name]["pending"] += 1

        fixture = sel.get("fixture") or {}
        by_player[name]["picks"].append(
            {
                "fixture": f"{'⭐ ' if fixture.get('is_star_pick') else ''}{fixture.get('home_team')} vs {fixture.get('away_team')}",
                "score": (
                    f"{fixture.get('home_score')}-{fixture.get('away_score')}"
                    if fixture.get("home_score") is not None and fixture.get("away_score") is not None
                    else None
                ),
                "status": fixture.get("match_status"),
                "result": result,
            }
        )

    payload = {
        "event": "bet_status_update",
        "sent_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "week": {
            "id": week.get("id"),
            "week_number": week.get("week_number"),
            "saturday_date": week.get("saturday_date"),
            "status": week.get("status"),
        },
        "totals": {
            "selections": len(selections),
            "resolved": len([s for s in selections if s.get("result") in ("won", "lost")]),
            "pending": len([s for s in selections if s.get("result") == "pending"]),
            "fines": len(fines),
        },
        "player_summary": by_player,
        "fines": fines,
    }

    res = requests.post(
        webhook_url,
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=30,
    )
    if res.status_code >= 300:
        raise RuntimeError(f"Webhook post failed: {res.status_code} {res.text[:250]}")

    print(f"Sent bet status update for week {week_id}: {res.status_code}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)

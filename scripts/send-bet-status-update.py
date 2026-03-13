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


def to_league_code(league_name_raw: Any) -> str:
    league_name = str(league_name_raw or "").strip()
    known_codes = {
        "Premier League": "pl",
        "Championship": "champ",
        "League One": "l1",
        "League Two": "l2",
        "National League": "nl",
        "Scottish Premiership": "spl",
        "Scottish Championship": "schamp",
        "Scottish League One": "sl1",
        "Scottish League Two": "sl2",
        "FA Cup": "fac",
        "Scottish Cup": "sc",
    }
    if league_name in known_codes:
        return known_codes[league_name]

    initials = "".join(
        part[:1].lower()
        for part in "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in league_name).split()
        if part
    )
    return initials or "lg"


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
    webhook_url = os.getenv("SELECTIONS_COMPLETE_WEBHOOK_URL") or os.getenv("PIPEDREAM_STATUS_WEBHOOK_URL")

    if not supabase_url or not service_role:
        raise SystemExit("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.")
    if not webhook_url:
        raise SystemExit("Missing SELECTIONS_COMPLETE_WEBHOOK_URL (or PIPEDREAM_STATUS_WEBHOOK_URL).")

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
    summary: Dict[str, List[Dict[str, Any]]] = {}
    selections_payload: List[Dict[str, Any]] = []
    for sel in selections:
        name = sel["player_name"]
        if name not in by_player:
            by_player[name] = {"wins": 0, "losses": 0, "pending": 0, "picks": []}
        if name not in summary:
            summary[name] = []

        result = sel.get("result")
        if result == "won":
            by_player[name]["wins"] += 1
        elif result == "lost":
            by_player[name]["losses"] += 1
        else:
            by_player[name]["pending"] += 1

        fixture = sel.get("fixture") or {}
        league_name = fixture.get("league_name")
        league_code = to_league_code(league_name)
        fixture_label = f"{'⭐ ' if fixture.get('is_star_pick') else ''}{fixture.get('home_team')} vs {fixture.get('away_team')} ({league_code})"
        score_text = (
            f"{fixture.get('home_score')}-{fixture.get('away_score')}"
            if fixture.get("home_score") is not None and fixture.get("away_score") is not None
            else None
        )

        by_player[name]["picks"].append(
            {
                "fixture": fixture_label,
                "score": score_text,
                "status": fixture.get("match_status"),
                "result": result,
            }
        )
        summary[name].append(
            {
                "fixture": fixture_label,
                "home_team": fixture.get("home_team"),
                "away_team": fixture.get("away_team"),
                "league_name": league_name,
                "league_code": league_code,
                "kick_off": fixture.get("kick_off"),
                "score": score_text,
                "status": fixture.get("match_status"),
                "result": result,
            }
        )
        selections_payload.append(
            {
                "player_name": name,
                "result": result,
                "total_goals": sel.get("total_goals"),
                "fixture": fixture,
            }
        )

    lines: List[str] = []
    lines.append(f"📣 Week {week.get('week_number')} status update")
    lines.append(f"📅 {week.get('saturday_date')}")
    lines.append("")
    for player_name in sorted(by_player.keys()):
        p = by_player[player_name]
        lines.append(f"{player_name}:")
        for pick in p["picks"]:
            score_text = f" ({pick['score']})" if pick.get("score") else ""
            status_text = f" [{pick['status']}]" if pick.get("status") else ""
            lines.append(f"- {pick['fixture']}{score_text}{status_text}")
        lines.append("")

    if fines:
        fine_bits = [f"{fine.get('player_name')} £{fine.get('amount')}" for fine in fines]
        lines.append(f"💰 Fines: {' • '.join(fine_bits)}")

    message = "\n".join(lines).strip()

    payload = {
        "event": "bet_status_update",
        "sent_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        # Backward-compatible top-level fields shared with selections_complete webhook shape.
        "week_id": week.get("id"),
        "saturday_date": week.get("saturday_date"),
        "total_selections": len(selections),
        "players_submitted": len(summary.keys()),
        "selections": selections_payload,
        "week": {
            "id": week.get("id"),
            "week_number": week.get("week_number"),
            "saturday_date": week.get("saturday_date"),
            "status": week.get("status"),
        },
        "summary": summary,
        "message": message,
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

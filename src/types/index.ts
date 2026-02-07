// ============================================================
// Types for Betting Overs
// ============================================================

export const PLAYERS = ['Kezza', 'Mikey', 'Krissy', 'Tommy'] as const;
export type PlayerName = (typeof PLAYERS)[number];

export const MAX_SELECTIONS_PER_PLAYER = 2;

// English top 5 + Scottish top 3 league IDs (api-football)
export const LEAGUE_IDS = {
  // England
  39: 'Premier League',
  40: 'Championship',
  41: 'League One',
  42: 'League Two',
  43: 'National League',
  // Scotland
  179: 'Scottish Premiership',
  180: 'Scottish Championship',
  181: 'Scottish League One',
} as const;

export const GOAL_THRESHOLD = 2; // "over 2.5 goals" = 3+ total

export interface Week {
  id: number;
  week_number: number;
  season: string;
  saturday_date: string;
  status: 'active' | 'completed';
  created_at: string;
}

export interface Fixture {
  id: number;
  api_fixture_id: number;
  week_id: number;
  home_team: string;
  away_team: string;
  home_team_logo: string | null;
  away_team_logo: string | null;
  league_name: string;
  league_id: number;
  kick_off: string;
  home_score: number | null;
  away_score: number | null;
  match_status: string;
  created_at: string;
}

export interface Selection {
  id: number;
  week_id: number;
  player_name: PlayerName;
  fixture_id: number;
  result: 'pending' | 'won' | 'lost';
  total_goals: number | null;
  created_at: string;
  fixture?: Fixture;
}

export interface Fine {
  id: number;
  week_id: number;
  player_name: PlayerName;
  amount: number;
  reason: string;
  fixture_id: number | null;
  cleared: boolean;
  created_at: string;
}

export interface PlayerStats {
  player_name: PlayerName;
  total_selections: number;
  wins: number;
  losses: number;
  pending: number;
  win_rate: number;
  total_fines: number;
  outstanding_fines: number;
  cleared_fines: number;
  current_streak: number;
  best_streak: number;
}

export interface WeekSummary {
  week: Week;
  selections: Selection[];
  fines: Fine[];
}

// API Football response types
export interface APIFixture {
  fixture: {
    id: number;
    date: string;
    status: {
      short: string;
      long: string;
    };
  };
  league: {
    id: number;
    name: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
    };
    away: {
      id: number;
      name: string;
      logo: string;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

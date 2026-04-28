// ============================================================
// Types for Betting Overs
// ============================================================

export const PLAYERS = ['Kezza', 'Mikey', 'Krissy', 'Tommy'] as const;
export type PlayerName = (typeof PLAYERS)[number];

export const MAX_SELECTIONS_PER_PLAYER = 2;

// SofaScore tournament IDs for the tracked England and Scotland competitions.
export const LEAGUE_IDS = {
  // Cups (priority display)
  19: 'FA Cup',
  347: 'Scottish Cup',
  // England
  17: 'Premier League',
  18: 'Championship',
  24: 'League One',
  25: 'League Two',
  173: 'National League',
  // Scotland
  36: 'Scottish Premiership',
  206: 'Scottish Championship',
  207: 'Scottish League One',
  209: 'Scottish League Two',
} as const;

export const GOAL_THRESHOLD = 2; // "over 2.5 goals" = 3+ total

export interface Week {
  id: number;
  week_number: number;
  season: string;
  saturday_date: string;
  target_date: string;
  target_kickoff_time: string;
  is_custom: boolean;
  status: 'active' | 'completed';
  rapidapi_request_budget: number | null;
  rapidapi_requests_used: number;
  created_at: string;
}

export interface Fixture {
  id: number;
  api_fixture_id: number;
  week_id: number;
  home_team: string;
  away_team: string;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_logo: string | null;
  away_team_logo: string | null;
  league_name: string;
  league_id: number;
  home_team_position: number | null;
  away_team_position: number | null;
  kick_off: string;
  home_score: number | null;
  away_score: number | null;
  match_status: string;
  home_form: Array<{
    result: 'W' | 'D' | 'L';
    homeScore: number;
    awayScore: number;
    opponent: string;
    opponentPosition?: number | null;
    homeAway: 'H' | 'A';
    date: string;
    competition: string;
  }> | null;
  away_form: Array<{
    result: 'W' | 'D' | 'L';
    homeScore: number;
    awayScore: number;
    opponent: string;
    opponentPosition?: number | null;
    homeAway: 'H' | 'A';
    date: string;
    competition: string;
  }> | null;
  odds_over_25: string | null;
  odds_under_25: string | null;
  is_star_pick: boolean;
  star_rank: number | null;
  star_score: number | null;
  insights_updated_at: string | null;
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
  current_loss_streak: number;
  best_loss_streak: number;
  avg_goals: number;
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

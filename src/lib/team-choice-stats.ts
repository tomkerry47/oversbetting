import type { TeamChoiceStats } from '@/types';

type TeamSelection = {
  fixture_id: number;
  result: string;
  fixture?: { home_team: string | null; away_team: string | null } | null;
};

export const MIN_TEAM_CHOICE_GAMES = 5;

export function calculateTeamChoices(selections: TeamSelection[]) {
  const teams = new Map<string, TeamChoiceStats>();
  const countedFixtures = new Set<number>();
  for (const selection of selections) {
    if (selection.result !== 'won' && selection.result !== 'lost') continue;
    if (!selection.fixture || countedFixtures.has(selection.fixture_id)) continue;
    countedFixtures.add(selection.fixture_id);
    // A pick is for the match's goal total, so it counts for both teams.
    const matchTeams = new Map<string, string>();
    for (const name of [selection.fixture?.home_team, selection.fixture?.away_team]) {
      const team = name?.trim();
      if (team) matchTeams.set(team.toLowerCase(), team);
    }
    for (const [key, name] of Array.from(matchTeams.entries())) {
      const team = teams.get(key) || {
        team: name, games: 0, wins: 0, losses: 0, win_rate: 0, loss_rate: 0,
      };
      team.games++;
      if (selection.result === 'won') team.wins++;
      else team.losses++;
      teams.set(key, team);
    }
  }

  const eligible = Array.from(teams.values())
    .filter((team) => team.games >= MIN_TEAM_CHOICE_GAMES)
    .map((team) => ({
      ...team,
      win_rate: Math.round(team.wins / team.games * 100),
      loss_rate: Math.round(team.losses / team.games * 100),
    }));
  const rank = (outcome: 'wins' | 'losses') => eligible
    .filter((team) => team[outcome] > 0)
    .sort((a, b) => b[outcome] / b.games - a[outcome] / a.games ||
      b[outcome] - a[outcome] || b.games - a.games || a.team.localeCompare(b.team))
    .slice(0, 3);

  return { won: rank('wins'), lost: rank('losses') };
}

'use client';

import { useState } from 'react';
import { Fixture, PlayerName, PLAYERS, MAX_SELECTIONS_PER_PLAYER } from '@/types';

interface FixtureSelectorProps {
  fixtures: Fixture[];
  weekId: number;
  existingSelections: Record<string, number[]>;
  onSelectionSubmitted: () => void;
}

interface FixtureDetails {
  homeForm: Array<{
    result: 'W' | 'D' | 'L';
    homeScore: number;
    awayScore: number;
    opponent: string;
    homeAway: 'H' | 'A';
    date: string;
    competition: string;
  }>;
  awayForm: Array<{
    result: 'W' | 'D' | 'L';
    homeScore: number;
    awayScore: number;
    opponent: string;
    homeAway: 'H' | 'A';
    date: string;
    competition: string;
  }>;
  odds: {
    over: string;
    under: string;
  } | null;
}

export default function FixtureSelector({
  fixtures,
  weekId,
  existingSelections,
  onSelectionSubmitted,
}: FixtureSelectorProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerName | null>(null);
  const [selectedFixtures, setSelectedFixtures] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null);
  const [fixtureDetails, setFixtureDetails] = useState<Record<number, FixtureDetails>>({});

  const formatKickoffTime = (isoDate: string): string => {
    const date = new Date(isoDate);
    return date.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const getOddsTone = (oddsRaw: string) => {
    const value = parseFloat(oddsRaw);
    if (Number.isNaN(value)) {
      return 'bg-slate-700/70 text-slate-300 border border-slate-600';
    }
    if (value > 2) {
      return 'bg-red-900/60 text-red-200 border border-red-700/70';
    }
    if (value < 1.5) {
      return 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/70';
    }
    return 'bg-amber-900/60 text-amber-200 border border-amber-700/70';
  };

  // Group fixtures by league
  const groupedFixtures = fixtures.reduce<Record<string, Fixture[]>>((acc, f) => {
    if (!acc[f.league_name]) acc[f.league_name] = [];
    acc[f.league_name].push(f);
    return acc;
  }, {});

  // Initialize collapsed state with all leagues collapsed by default
  const [collapsedLeagues, setCollapsedLeagues] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    Object.keys(groupedFixtures).forEach(league => {
      initialState[league] = true;
    });
    return initialState;
  });

  // Define league order (by league ID mapping)
  const leagueOrder: Record<string, number> = {
    'FA Cup': 1,
    'Scottish Cup': 2,
    'Premier League': 3,
    'Championship': 4,
    'League One': 5,
    'League Two': 6,
    'National League': 7,
    'Scottish Premiership': 8,
    'Scottish Championship': 9,
    'Scottish League Two': 10,
    'Scottish League One': 11,
  };

  // Sort leagues by defined order
  const sortedLeagues = Object.entries(groupedFixtures).sort(([leagueA], [leagueB]) => {
    const orderA = leagueOrder[leagueA] ?? 999;
    const orderB = leagueOrder[leagueB] ?? 999;
    return orderA - orderB;
  });

  const toggleLeague = (league: string) => {
    setCollapsedLeagues(prev => ({
      ...prev,
      [league]: !prev[league]
    }));
  };

  const convertOddsToDecimal = (odds: string): string => {
    if (!odds || odds === 'N/A') return odds;
    if (odds.includes('.')) return odds;
    if (odds.includes('/')) {
      const parts = odds.split('/');
      const numerator = parseFloat(parts[0]);
      const denominator = parseFloat(parts[1]);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return ((numerator / denominator) + 1).toFixed(2);
      }
    }
    return odds;
  };

  const fetchFixtureDetails = async (fixture: Fixture) => {
    if (!fixture.home_team_id || !fixture.away_team_id) {
      console.error('Missing team IDs for fixture');
      return;
    }

    if (fixtureDetails[fixture.id]) {
      setExpandedFixture(expandedFixture === fixture.id ? null : fixture.id);
      return;
    }

    // Use cached form/odds from fixtures table when available.
    if (fixture.home_form && fixture.away_form) {
      setFixtureDetails(prev => ({
        ...prev,
        [fixture.id]: {
          homeForm: fixture.home_form || [],
          awayForm: fixture.away_form || [],
          odds:
            fixture.odds_over_25 || fixture.odds_under_25
              ? {
                  over: convertOddsToDecimal(fixture.odds_over_25 || 'N/A'),
                  under: convertOddsToDecimal(fixture.odds_under_25 || 'N/A'),
                }
              : null,
        },
      }));
      setExpandedFixture(expandedFixture === fixture.id ? null : fixture.id);
      return;
    }

    try {
      const res = await fetch(
        `/api/test/fixture-details?fixtureId=${fixture.api_fixture_id}&homeTeamId=${fixture.home_team_id}&awayTeamId=${fixture.away_team_id}&leagueId=${fixture.league_id}`
      );
      const data = await res.json();

      if (res.ok) {
        if (data.odds) {
          data.odds = {
            over: convertOddsToDecimal(data.odds.over),
            under: convertOddsToDecimal(data.odds.under),
          };
        }
        setFixtureDetails(prev => ({ ...prev, [fixture.id]: data }));
        setExpandedFixture(fixture.id);
      }
    } catch (err) {
      console.error('Error fetching fixture details:', err);
    }
  };

  const handleFixtureToggle = (fixtureId: number) => {
    setSelectedFixtures((prev) => {
      if (prev.includes(fixtureId)) {
        return prev.filter((id) => id !== fixtureId);
      }
      if (prev.length >= MAX_SELECTIONS_PER_PLAYER) {
        return prev;
      }
      return [...prev, fixtureId];
    });
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedPlayer) {
      setError('Select a player first');
      return;
    }
    if (selectedFixtures.length !== MAX_SELECTIONS_PER_PLAYER) {
      setError(`Select exactly ${MAX_SELECTIONS_PER_PLAYER} fixtures`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: selectedPlayer,
          fixture_ids: selectedFixtures,
          week_id: weekId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit selections');
        return;
      }

      setSuccess(`${selectedPlayer}'s picks submitted! ✅`);
      setSelectedPlayer(null);
      setSelectedFixtures([]);
      onSelectionSubmitted();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Network error, please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const playerHasSelected = (player: PlayerName) => {
    return (existingSelections[player] || []).length > 0;
  };

  return (
    <div className="space-y-4">
      {/* Player Selection */}
      <div className="card">
        <h3 className="text-base font-semibold text-white mb-3">Who&apos;s picking?</h3>
        <div className="grid grid-cols-2 gap-2">
          {PLAYERS.map((player) => {
            const hasSelected = playerHasSelected(player);
            const isActive = selectedPlayer === player;

            return (
              <button
                key={player}
                onClick={() => {
                  setSelectedPlayer(player);
                  setSelectedFixtures([]);
                  setError(null);
                }}
                className={`py-4 px-3 rounded-xl border-2 transition-all font-semibold text-center active:scale-[0.97] ${
                  isActive
                    ? 'border-emerald-500 bg-emerald-900/40 text-emerald-400'
                    : hasSelected
                    ? 'border-slate-600 bg-slate-700/50 text-slate-300'
                    : 'border-slate-600 bg-slate-800 text-white'
                }`}
              >
                <div className="text-base">{player}</div>
                {hasSelected && (
                  <div className="text-xs text-emerald-400 mt-1">✅ Picked</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fixture Selection */}
      {selectedPlayer && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-white">
              {selectedPlayer}&apos;s Picks
              <span className="text-xs text-slate-400 ml-1">
                ({selectedFixtures.length}/{MAX_SELECTIONS_PER_PLAYER})
              </span>
            </h3>
            {playerHasSelected(selectedPlayer) && (
              <span className="text-[10px] text-amber-400">
                ⚠️ Replaces picks
              </span>
            )}
          </div>

          {sortedLeagues.map(([league, leagueFixtures]) => {
            const isCollapsed = collapsedLeagues[league];
            const starCount = leagueFixtures.filter((fixture) => fixture.is_star_pick).length;
            
            return (
              <div key={league} className="mb-3">
                <button
                  onClick={() => toggleLeague(league)}
                  className="w-full text-left"
                >
                  <h4 className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1.5">
                    <span className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                    {league} ({leagueFixtures.length})
                    {starCount > 0 && (
                      <span className="inline-flex items-center rounded-md bg-amber-500/20 border border-amber-400/60 px-1 py-0.5 text-[10px] text-amber-300">
                        ⭐ {starCount}
                      </span>
                    )}
                  </h4>
                </button>
                
                {!isCollapsed && (
                  <div className="space-y-1.5">{leagueFixtures.map((fixture) => {
                      const isSelected = selectedFixtures.includes(fixture.id);
                      const isFull =
                        selectedFixtures.length >= MAX_SELECTIONS_PER_PLAYER &&
                        !isSelected;
                      const isExpanded = expandedFixture === fixture.id;
                      const details = fixtureDetails[fixture.id];

                      return (
                        <div key={fixture.id}>
                          <button
                            onClick={() => handleFixtureToggle(fixture.id)}
                            disabled={isFull}
                            className={`w-full text-left p-3.5 border transition-all fixture-selectable
                              ${
                                isSelected
                                  ? 'fixture-selected border-emerald-500'
                                  : isFull
                                  ? 'border-slate-700 bg-slate-800/50 opacity-40 cursor-not-allowed'
                                  : 'border-slate-700 bg-slate-800/50'
                              }
                              ${isExpanded ? 'rounded-t-xl border-b-0' : 'rounded-xl'}`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center text-xs
                                  ${
                                    isSelected
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : 'border-slate-500'
                                  }`}
                              >
                                {isSelected && '✓'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="w-full flex items-start justify-between gap-2">
                                  <div className="text-sm font-medium text-white flex items-start gap-1.5 min-w-0">
                                    {fixture.is_star_pick && (
                                      <span
                                        className="inline-flex items-center rounded-md bg-amber-500/20 border border-amber-400/60 px-1 py-0.5 text-[10px] text-amber-300 flex-shrink-0"
                                        title={fixture.star_rank ? `Star pick #${fixture.star_rank}` : 'Star pick'}
                                      >
                                        ⭐
                                      </span>
                                    )}
                                    <span className="whitespace-normal break-words leading-snug">
                                      {fixture.home_team}
                                      <span className="text-slate-500 text-xs mx-1">vs</span>
                                      {fixture.away_team}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
                                    <span className="inline-flex items-center rounded-md bg-slate-700/60 border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-200">
                                      KO {formatKickoffTime(fixture.kick_off)}
                                    </span>
                                    {(() => {
                                      const over = convertOddsToDecimal(fixture.odds_over_25 || 'N/A');
                                      const under = convertOddsToDecimal(fixture.odds_under_25 || 'N/A');
                                      return (
                                        <>
                                          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${getOddsTone(over)}`}>
                                            O {over}
                                          </span>
                                          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${getOddsTone(under)}`}>
                                            U {under}
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                              {fixture.home_team_id && fixture.away_team_id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    fetchFixtureDetails(fixture);
                                  }}
                                  className="text-blue-400 text-xs hover:text-blue-300 px-2 py-1 rounded bg-slate-700/50"
                                >
                                  {isExpanded ? '▲' : '▼'}
                                </button>
                              )}
                            </div>
                          </button>

                          {isExpanded && details && (
                            <div className="bg-slate-900 border border-slate-700 border-t-0 rounded-b-xl p-3">
                              <h4 className="text-xs font-bold text-white mb-2">📊 Form (Last 5)</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
                                  <div className="text-[10px] font-semibold text-slate-300 mb-1">{fixture.home_team}</div>
                                  <div className="flex gap-1 mb-1">
                                    {details.homeForm.map((match, idx) => (
                                      <div
                                        key={idx}
                                        className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold
                                          ${match.result === 'W' ? 'bg-emerald-500' : match.result === 'D' ? 'bg-slate-500' : 'bg-red-500'} text-white`}
                                      >
                                        {match.result}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="space-y-0.5">
                                    {details.homeForm.map((match, idx) => (
                                      <div key={idx} className="text-[9px] text-slate-400">
                                        {match.homeAway === 'H' ? 'vs' : '@'} {match.opponent}: {match.homeScore}-{match.awayScore}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
                                  <div className="text-[10px] font-semibold text-slate-300 mb-1">{fixture.away_team}</div>
                                  <div className="flex gap-1 mb-1">
                                    {details.awayForm.map((match, idx) => (
                                      <div
                                        key={idx}
                                        className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold
                                          ${match.result === 'W' ? 'bg-emerald-500' : match.result === 'D' ? 'bg-slate-500' : 'bg-red-500'} text-white`}
                                      >
                                        {match.result}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="space-y-0.5">
                                    {details.awayForm.map((match, idx) => (
                                      <div key={idx} className="text-[9px] text-slate-400">
                                        {match.homeAway === 'H' ? 'vs' : '@'} {match.opponent}: {match.homeScore}-{match.awayScore}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {fixtures.length === 0 && (
            <p className="text-slate-400 text-center py-8">
              No 15:00 fixtures found for this Saturday. Try refreshing.
            </p>
          )}
        </div>
      )}

      {/* Submit */}
      {selectedPlayer && selectedFixtures.length > 0 && (
        <div className={`card sticky bottom-20 z-10 transition-all ${
          selectedFixtures.length === MAX_SELECTIONS_PER_PLAYER 
            ? 'bg-gradient-to-r from-emerald-900 to-emerald-800 border-2 border-emerald-500 shadow-lg shadow-emerald-500/50' 
            : ''
        }`}>
          <p className={`font-medium text-sm text-center mb-1 ${
            selectedFixtures.length === MAX_SELECTIONS_PER_PLAYER 
              ? 'text-emerald-100 text-base' 
              : 'text-white'
          }`}>
            {selectedFixtures.length}/{MAX_SELECTIONS_PER_PLAYER} selected
            {selectedFixtures.length === MAX_SELECTIONS_PER_PLAYER
              ? ' — Ready to submit! ✅'
              : ` — Pick ${MAX_SELECTIONS_PER_PLAYER - selectedFixtures.length} more`}
          </p>
          <button
            onClick={handleSubmit}
            disabled={
              submitting ||
              selectedFixtures.length !== MAX_SELECTIONS_PER_PLAYER
            }
            className={`w-full text-base py-4 rounded-xl font-bold transition-all ${
              selectedFixtures.length === MAX_SELECTIONS_PER_PLAYER
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg animate-pulse'
                : 'btn-primary'
            }`}
          >
            {submitting ? 'Submitting...' : `Submit ${selectedPlayer}'s Picks 🎯`}
          </button>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-sm">
          {success}
        </div>
      )}
    </div>
  );
}

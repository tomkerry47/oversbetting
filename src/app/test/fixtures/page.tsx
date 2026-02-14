'use client';

import { useState } from 'react';

interface RawFixture {
  id: number;
  homeTeam: string;
  homeTeamId: number;
  awayTeam: string;
  awayTeamId: number;
  kickOff: string;
  kickOffTime: string;
  league: string;
  leagueId: number;
  tournament: string;
  is3pm: boolean;
}

interface FixtureDetails {
  homeForm: Array<{
    result: string;
    homeScore: number;
    awayScore: number;
    opponent: string;
    homeAway: string;
  }>;
  awayForm: Array<{
    result: string;
    homeScore: number;
    awayScore: number;
    opponent: string;
    homeAway: string;
  }>;
  odds: {
    home: string;
    draw: string;
    away: string;
  } | null;
}

export default function TestFixturesPage() {
  const [date, setDate] = useState('2026-02-07');
  const [loading, setLoading] = useState(false);
  const [fixtures, setFixtures] = useState<RawFixture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAllLeagues, setShowAllLeagues] = useState(false);
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null);
  const [fixtureDetails, setFixtureDetails] = useState<Record<number, FixtureDetails>>({});

  const fetchFixtures = async () => {
    setLoading(true);
    setError(null);
    setFixtures([]);
    setExpandedFixture(null);
    setFixtureDetails({});

    try {
      const res = await fetch(`/api/test/fixtures?date=${date}&showAll=${showAllLeagues}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to fetch');
        return;
      }

      setFixtures(data.fixtures || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Convert fractional odds to decimal (e.g., "3/1" -> "4.00")
  const convertOddsToDecimal = (odds: string): string => {
    if (!odds || odds === 'N/A') return odds;
    
    // If already decimal (contains a dot)
    if (odds.includes('.')) return odds;
    
    // If fractional (contains a slash)
    if (odds.includes('/')) {
      const parts = odds.split('/');
      const numerator = parseFloat(parts[0]);
      const denominator = parseFloat(parts[1]);
      
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        const decimal = (numerator / denominator) + 1;
        return decimal.toFixed(2);
      }
    }
    
    // Return as-is if can't convert
    return odds;
  };

  const fetchFixtureDetails = async (fixture: RawFixture) => {
    if (fixtureDetails[fixture.id]) {
      // Already fetched
      setExpandedFixture(expandedFixture === fixture.id ? null : fixture.id);
      return;
    }

    try {
      const res = await fetch(
        `/api/test/fixture-details?fixtureId=${fixture.id}&homeTeamId=${fixture.homeTeamId}&awayTeamId=${fixture.awayTeamId}&leagueId=${fixture.leagueId}`
      );
      const data = await res.json();

      if (res.ok) {
        // Convert odds to decimal if they're fractional
        if (data.odds) {
          console.log('Original odds:', data.odds);
          data.odds = {
            over: convertOddsToDecimal(data.odds.over),
            under: convertOddsToDecimal(data.odds.under),
          };
          console.log('Converted odds:', data.odds);
        }
        setFixtureDetails(prev => ({ ...prev, [fixture.id]: data }));
        setExpandedFixture(fixture.id);
      }
    } catch (err) {
      console.error('Error fetching fixture details:', err);
    }
  };

  // Group fixtures by league
  const fixturesByLeague = fixtures.reduce<Record<string, RawFixture[]>>((acc, fixture) => {
    const key = `${fixture.league} (ID: ${fixture.leagueId})`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(fixture);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold text-white mb-4">🔍 Test Fixtures API</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Test Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
            <div>
              <label className="text-sm font-medium text-white">Show All Leagues</label>
              <p className="text-xs text-slate-400 mt-0.5">Display all available leagues (not just target 9)</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAllLeagues(!showAllLeagues)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                showAllLeagues ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showAllLeagues ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <button
            onClick={fetchFixtures}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Fetching...' : 'Fetch Fixtures'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-500 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>

      {fixtures.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-white mb-4">
            ⚽ Found {fixtures.length} fixtures at 15:00
          </h2>

          <div className="space-y-6">{Object.entries(fixturesByLeague).map(([league, leagueFixtures]) => (
              <div key={league}>
                <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                  {league} ({leagueFixtures.length})
                </h3>
                <div className="space-y-2">
                  {leagueFixtures.map((fixture) => {
                    const details = fixtureDetails[fixture.id];
                    const isExpanded = expandedFixture === fixture.id;
                    
                    return (
                    <div
                      key={fixture.id}
                      className="bg-slate-700 rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => fetchFixtureDetails(fixture)}
                        className="w-full p-3 hover:bg-slate-600 transition-colors text-left"
                      >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="text-white font-medium">
                            {fixture.homeTeam} vs {fixture.awayTeam}
                          </p>
                          <p className="text-slate-400 text-sm mt-1">
                            {fixture.tournament}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 text-sm font-bold">
                            {fixture.kickOffTime}
                          </p>
                          <p className="text-slate-500 text-xs">ID: {fixture.id}</p>
                          <p className="text-slate-400 text-xs mt-1">
                            {isExpanded ? '▼' : '▶'} {details ? 'Details' : 'Load Details'}
                          </p>
                        </div>
                      </div>
                      </button>
                      
                      {isExpanded && details && (
                        <div className="border-t border-slate-600 p-4 space-y-5">
                          {/* Betting Odds */}
                          {details.odds ? (
                            <div className="bg-gradient-to-r from-amber-900/20 to-amber-800/20 border border-amber-700/50 rounded-lg p-4">
                              <h4 className="text-base font-bold text-amber-400 mb-3 flex items-center gap-2">
                                💰 Over/Under 2.5 Goals
                              </h4>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-900/60 rounded-lg p-3 text-center border border-slate-600">
                                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Over 2.5</div>
                                  <div className="text-xs text-slate-500 mb-1">3+ Goals</div>
                                  <div className="text-lg font-bold text-emerald-400">{details.odds.over}</div>
                                </div>
                                <div className="bg-slate-900/60 rounded-lg p-3 text-center border border-slate-600">
                                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Under 2.5</div>
                                  <div className="text-xs text-slate-500 mb-1">0-2 Goals</div>
                                  <div className="text-lg font-bold text-sky-400">{details.odds.under}</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                              <p className="text-slate-400 text-sm">⚠️ Betting odds not available</p>
                            </div>
                          )}
                          
                          {/* Team Form */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-base font-bold text-white">📊 Recent Form (Last 5 Games)</h4>
                              <div className="text-[10px] text-slate-400 uppercase tracking-wide">← Most Recent</div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              {/* Home Form */}
                              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
                                <div className="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-2">
                                  🏠 {fixture.homeTeam}
                                </div>
                                <div className="space-y-1">
                                  {details.homeForm.map((match, i) => (
                                    <div key={i} className="text-[11px] text-slate-400 flex items-center justify-between gap-1">
                                      <div className="flex items-center gap-1 flex-1">
                                        <span className={`w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold ${
                                          match.result === 'W' ? 'bg-emerald-500' :
                                          match.result === 'D' ? 'bg-slate-500' : 'bg-red-500'
                                        }`}>{match.result}</span>
                                        <span>{match.homeAway === 'H' ? 'vs' : '@'} {match.opponent}: {match.homeScore}-{match.awayScore}</span>
                                      </div>
                                      <span className="text-[9px] text-slate-500">{match.date}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                              {/* Away Form */}
                              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
                                <div className="text-sm font-bold text-blue-400 mb-2 flex items-center gap-2">
                                  ✈️ {fixture.awayTeam}
                                </div>
                                <div className="space-y-1">
                                  {details.awayForm.map((match, i) => (
                                    <div key={i} className="text-[11px] text-slate-400 flex items-center justify-between gap-1">
                                      <div className="flex items-center gap-1 flex-1">
                                        <span className={`w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold ${
                                          match.result === 'W' ? 'bg-emerald-500' :
                                          match.result === 'D' ? 'bg-slate-500' : 'bg-red-500'
                                        }`}>{match.result}</span>
                                        <span>{match.homeAway === 'H' ? 'vs' : '@'} {match.opponent}: {match.homeScore}-{match.awayScore}</span>
                                      </div>
                                      <span className="text-[9px] text-slate-500">{match.date}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && fixtures.length === 0 && !error && (
        <div className="card text-center text-slate-400">
          Enter a date and click "Fetch Fixtures" to test
        </div>
      )}
    </div>
  );
}

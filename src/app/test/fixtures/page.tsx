'use client';

import { useState } from 'react';

interface RawFixture {
  id: number;
  homeTeam: string;
  awayTeam: string;
  kickOff: string;
  kickOffTime: string;
  league: string;
  leagueId: number;
  tournament: string;
  is3pm: boolean;
}

export default function TestFixturesPage() {
  const [date, setDate] = useState('2026-02-07');
  const [loading, setLoading] = useState(false);
  const [fixtures, setFixtures] = useState<RawFixture[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchFixtures = async () => {
    setLoading(true);
    setError(null);
    setFixtures([]);

    try {
      const res = await fetch(`/api/test/fixtures?date=${date}`);
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
                  {leagueFixtures.map((fixture) => (
                    <div
                      key={fixture.id}
                      className="p-3 bg-slate-700 rounded-lg"
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
                        </div>
                      </div>
                    </div>
                  ))}
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

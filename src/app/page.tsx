'use client';

import { useState, useEffect, useCallback } from 'react';
import FixtureSelector from '@/components/FixtureSelector';
import SelectionsDisplay from '@/components/SelectionsDisplay';
import ResultsChecker from '@/components/ResultsChecker';
import WeeklyReset from '@/components/WeeklyReset';
import { Fixture, Selection, Week, PLAYERS } from '@/types';
import { formatDate } from '@/lib/utils';

export default function HomePage() {
  const [week, setWeek] = useState<Week | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Loading fixtures...');

  const fetchData = useCallback(async () => {
    try {
      setLoadingMessage('Fetching fixtures from SofaScore...');
      // Fetch fixtures (will create week if needed)
      const fixturesRes = await fetch('/api/fixtures');
      const fixturesData = await fixturesRes.json();

      if (fixturesData.error) {
        setError(fixturesData.error);
        return;
      }

      const fixtureCount = fixturesData.fixtures?.length || 0;
      setLoadingMessage(`Found ${fixtureCount} fixture${fixtureCount !== 1 ? 's' : ''} at 15:00`);
      
      setWeek(fixturesData.week);
      setFixtures(fixturesData.fixtures || []);

      // Fetch selections for this week
      if (fixturesData.week) {
        const selectionsRes = await fetch(
          `/api/selections?week_id=${fixturesData.week.id}`
        );
        const selectionsData = await selectionsRes.json();
        setSelections(selectionsData.selections || []);
        setLoadingMessage(''); // Clear loading message after selections loaded
      }
    } catch (err) {
      setError('Failed to load data. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefreshFixtures = async () => {
    setRefreshing(true);
    setError(null);
    setLoadingMessage('Refreshing fixtures from API...');
    try {
      const res = await fetch('/api/fixtures', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to refresh fixtures');
        setLoadingMessage('');
        return;
      }
      
      const fixtureCount = data.fixtures?.length || 0;
      setLoadingMessage(`Refreshed ${fixtureCount} fixture${fixtureCount !== 1 ? 's' : ''}`);
      
      setWeek(data.week);
      setFixtures(data.fixtures || []);
      
      // Refresh selections
      if (data.week) {
        const selectionsRes = await fetch(`/api/selections?week_id=${data.week.id}`);
        const selectionsData = await selectionsRes.json();
        setSelections(selectionsData.selections || []);
      }
      
      // Clear message after 2 seconds
      setTimeout(() => setLoadingMessage(''), 2000);
    } catch (err) {
      setError('Network error, please try again');
      setLoadingMessage('');
    } finally {
      setRefreshing(false);
    }
  };

  const existingSelections = PLAYERS.reduce<Record<string, number[]>>(
    (acc, player) => {
      acc[player] = selections
        .filter((s) => s.player_name === player)
        .map((s) => s.fixture_id);
      return acc;
    },
    {}
  );

  const allPlayersPicked = PLAYERS.every(
    (p) => (existingSelections[p] || []).length > 0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">⚽</div>
          <p className="text-slate-400">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card max-w-lg mx-auto mt-12 text-center">
        <p className="text-red-400 text-lg mb-4">❌ {error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week Header */}
      <div className="card">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">
              ⚽ Week {week?.week_number || '?'}
            </h1>
            <button
              onClick={handleRefreshFixtures}
              disabled={refreshing}
              className="btn-secondary !py-2 !px-3 text-xs"
            >
              {refreshing ? '🔄' : '🔄 Refresh'}
            </button>
          </div>
          <p className="text-slate-400 text-sm">
            Sat {week ? formatDate(week.saturday_date) : '...'} • 15:00 KOs
          </p>
          <p className="text-emerald-400 text-xs">
            {fixtures.length} fixture{fixtures.length !== 1 ? 's' : ''} • Over 2.5 goals to win 💰
          </p>
          {loadingMessage && (
            <p className="text-blue-400 text-xs animate-pulse">
              {loadingMessage}
            </p>
          )}
        </div>
      </div>

      {/* Selections Display */}
      <SelectionsDisplay selections={selections} />

      {/* Results Checker */}
      <ResultsChecker
        onResultsChecked={fetchData}
        hasSelections={selections.length > 0}
      />

      {/* Fixture Selector */}
      {week && (
        <FixtureSelector
          fixtures={fixtures}
          weekId={week.id}
          existingSelections={existingSelections}
          onSelectionSubmitted={fetchData}
        />
      )}

      {/* Weekly Reset */}
      {allPlayersPicked && <WeeklyReset onReset={fetchData} />}
    </div>
  );
}

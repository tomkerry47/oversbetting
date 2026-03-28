'use client';

import { useState, useEffect, useCallback } from 'react';
import FixtureSelector from '@/components/FixtureSelector';
import SelectionsDisplay from '@/components/SelectionsDisplay';
import WeeklyReset from '@/components/WeeklyReset';
import { Fixture, Selection, Week, PLAYERS } from '@/types';
import { formatDate } from '@/lib/utils';

async function fetchJsonWithTimeout(url: string, init?: RequestInit, timeoutMs: number = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    console.log(`[Picks] ${url} -> ${response.status} in ${Date.now() - started}ms`);
    return { response, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function HomePage() {
  const [week, setWeek] = useState<Week | null>(null);
  const [currentWeekNumber, setCurrentWeekNumber] = useState<number | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Loading fixtures...');
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, 1 = next week, etc.

  const fetchData = useCallback(async (offset: number = 0) => {
    try {
      console.log(`[Picks] fetchData start (weekOffset=${offset})`);
      setLoadingMessage('Loading fixtures...');
      const { response: fixturesRes, data: fixturesData } = await fetchJsonWithTimeout(
        `/api/fixtures?weekOffset=${offset}`,
        undefined,
        20000
      );

      if (!fixturesRes.ok) {
        setError(fixturesData.error || 'Failed to load fixtures');
        setLoadingMessage('');
        return;
      }

      if (fixturesData.error) {
        setError(fixturesData.error);
        setLoadingMessage('');
        return;
      }

      const fixtureCount = fixturesData.fixtures?.length || 0;
      setLoadingMessage(`Found ${fixtureCount} fixture${fixtureCount !== 1 ? 's' : ''} at 15:00`);
      
      setWeek(fixturesData.week);
      setFixtures(fixturesData.fixtures || []);
      
      // Store current week number on first load
      if (currentWeekNumber === null && offset === 0) {
        setCurrentWeekNumber(fixturesData.week?.week_number || null);
      }

      // Fetch selections for this week
      if (fixturesData.week) {
        const { response: selectionsRes, data: selectionsData } = await fetchJsonWithTimeout(
          `/api/selections?week_id=${fixturesData.week.id}`,
          undefined,
          20000
        );
        if (selectionsRes.ok) {
          setSelections(selectionsData.selections || []);
        } else {
          console.error('[Picks] selections load failed:', selectionsData);
        }
      }
      setLoadingMessage(''); // Always clear after load attempt
      console.log(`[Picks] fetchData success (weekOffset=${offset})`);
    } catch (err) {
      console.error('[Picks] fetchData error:', err);
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Loading timed out. Please refresh or try again.');
      } else {
        setError('Failed to load data. Check your connection.');
      }
      setLoadingMessage('');
    } finally {
      setLoading(false);
    }
  }, [currentWeekNumber]);

  useEffect(() => {
    fetchData(weekOffset);
  }, [fetchData, weekOffset]);

  const handlePreviousWeek = () => {
    if (weekOffset > 0) {
      setWeekOffset(prev => prev - 1);
    }
  };

  const handleNextWeek = () => {
    setWeekOffset(prev => prev + 1);
  };

  const handleRefreshFixtures = async () => {
    setRefreshing(true);
    setError(null);
    setLoadingMessage('Triggering fixture sync job...');
    try {
      const targetWeekOffset = Math.max(0, weekOffset);
      const triggerRes = await fetch('/api/fixtures/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekOffset: targetWeekOffset }),
      });
      const triggerData = await triggerRes.json();
      
      if (!triggerRes.ok) {
        setError(triggerData.error || 'Failed to trigger fixture sync');
        setLoadingMessage('');
        return;
      }

      if (weekOffset !== targetWeekOffset) {
        setWeekOffset(targetWeekOffset);
      }

      const runId = triggerData.runId;
      if (!runId) {
        setLoadingMessage('Fixture sync started. Check back shortly for updates.');
        setTimeout(() => setLoadingMessage(''), 5000);
        return;
      }

      setLoadingMessage('Fixture sync running in GitHub Actions...');

      // Poll workflow status until completion (up to ~3 minutes).
      const maxStatusPolls = 36;
      for (let i = 0; i < maxStatusPolls; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const statusRes = await fetch(`/api/fixtures/trigger-status?runId=${runId}`);
        const statusData = await statusRes.json();

        if (!statusRes.ok) {
          setError(statusData.error || 'Failed checking workflow status');
          setLoadingMessage('');
          return;
        }

        if (statusData.status === 'completed') {
          if (statusData.conclusion !== 'success') {
            setError(`Fixture sync failed (${statusData.conclusion || 'unknown'})`);
            setLoadingMessage('');
            return;
          }

          const fixturesRes = await fetch(`/api/fixtures?weekOffset=${targetWeekOffset}`);
          const fixturesData = await fixturesRes.json();
          const fixtureCount = fixturesData.fixtures?.length || 0;

          setWeek(fixturesData.week);
          setFixtures(fixturesData.fixtures || []);
          if (fixturesData.week) {
            const selectionsRes = await fetch(`/api/selections?week_id=${fixturesData.week.id}`);
            const selectionsData = await selectionsRes.json();
            setSelections(selectionsData.selections || []);
          }
          setLoadingMessage(`Fixture sync completed: ${fixtureCount} fixture${fixtureCount !== 1 ? 's' : ''}`);
          setTimeout(() => setLoadingMessage(''), 5000);
          return;
        }
      }

      setLoadingMessage('Fixture sync is still running. Check back shortly.');
      setTimeout(() => setLoadingMessage(''), 5000);
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
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousWeek}
                disabled={weekOffset === 0}
                className="text-xl disabled:opacity-30 disabled:cursor-not-allowed hover:scale-110 transition-transform"
                title="Previous week"
              >
                ◀️
              </button>
              <h1 className="text-xl font-bold text-white">
                ⚽ Week {week?.week_number || '?'}
              </h1>
              <button
                onClick={handleNextWeek}
                className="text-xl hover:scale-110 transition-transform"
                title="Next week"
              >
                ▶️
              </button>
            </div>
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

      {/* Fixture Selector */}
      {week && (
        <FixtureSelector
          key={week.id}
          fixtures={fixtures}
          weekId={week.id}
          existingSelections={existingSelections}
          onSelectionSubmitted={() => fetchData(weekOffset)}
        />
      )}

      {/* Weekly Reset */}
      {allPlayersPicked && <WeeklyReset onReset={fetchData} />}
    </div>
  );
}

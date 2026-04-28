'use client';

import { useState, useEffect, useCallback } from 'react';
import FixtureSelector from '@/components/FixtureSelector';
import SelectionsDisplay from '@/components/SelectionsDisplay';
import WeeklyReset from '@/components/WeeklyReset';
import { Fixture, Selection, Week, PLAYERS } from '@/types';
import { formatDate, formatKickoffTimeLabel, formatRoundLabel, getRelevantSaturday } from '@/lib/utils';

type RoundQuery =
  | { mode: 'standard'; weekOffset: number }
  | { mode: 'custom'; targetDate: string; kickoffTime: string }
  | { mode: 'existing'; weekId: number };

async function fetchJsonWithTimeout(url: string, init?: RequestInit, timeoutMs: number = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(url, { cache: 'no-store', ...init, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    console.log(`[Picks] ${url} -> ${response.status} in ${Date.now() - started}ms`);
    return { response, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function HomePage() {
  const [week, setWeek] = useState<Week | null>(null);
  const [rounds, setRounds] = useState<Week[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Loading fixtures...');
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, 1 = next week, etc.
  const [activeQuery, setActiveQuery] = useState<RoundQuery>({ mode: 'standard', weekOffset: 0 });
  const [customDate, setCustomDate] = useState(getRelevantSaturday(0));
  const [customKickoffTime, setCustomKickoffTime] = useState('19:45');
  const [showCustomRoundMenu, setShowCustomRoundMenu] = useState(false);
  const [enrichFixtures, setEnrichFixtures] = useState(true);
  const [enrichOdds, setEnrichOdds] = useState(false);

  const fetchData = useCallback(async (query: RoundQuery) => {
    try {
      const fixturesUrl =
        query.mode === 'existing'
          ? `/api/fixtures?weekId=${query.weekId}`
          : query.mode === 'custom'
          ? `/api/fixtures?targetDate=${encodeURIComponent(query.targetDate)}&kickoffTime=${encodeURIComponent(query.kickoffTime)}`
          : `/api/fixtures?weekOffset=${query.weekOffset}`;

      console.log('[Picks] fetchData start', query);
      setLoadingMessage('Loading fixtures...');
      const { response: fixturesRes, data: fixturesData } = await fetchJsonWithTimeout(
        fixturesUrl,
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
      const kickoffLabel = formatKickoffTimeLabel(fixturesData.week?.target_kickoff_time || (query.mode === 'custom' ? query.kickoffTime : '15:00'));
      setLoadingMessage(`Found ${fixtureCount} fixture${fixtureCount !== 1 ? 's' : ''} at ${kickoffLabel}`);
      
      setWeek(fixturesData.week);
      setFixtures(fixturesData.fixtures || []);

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
      console.log('[Picks] fetchData success', query);
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
  }, []);

  const loadSelectionsForWeek = useCallback(async (weekId: number) => {
    const { response: selectionsRes, data: selectionsData } = await fetchJsonWithTimeout(
      `/api/selections?week_id=${weekId}`,
      undefined,
      20000
    );

    if (selectionsRes.ok) {
      setSelections(selectionsData.selections || []);
    } else {
      console.error('[Picks] selections load failed:', selectionsData);
    }
  }, []);

  const getFixturesUrl = useCallback((query: RoundQuery) => {
    if (query.mode === 'existing') {
      return `/api/fixtures?weekId=${query.weekId}`;
    }
    return query.mode === 'custom'
      ? `/api/fixtures?targetDate=${encodeURIComponent(query.targetDate)}&kickoffTime=${encodeURIComponent(query.kickoffTime)}`
      : `/api/fixtures?weekOffset=${query.weekOffset}`;
  }, []);

  const loadRounds = useCallback(async () => {
    try {
      // Only load active weeks within the next 6 days for the main-page navigation.
      const { response, data } = await fetchJsonWithTimeout('/api/weeks?upcoming=true', undefined, 20000);
      if (response.ok) {
        setRounds(data.weeks || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const hydrateRoundFromFixtures = useCallback(async (query: RoundQuery) => {
    const maxFixturePolls = 8;
    const fixturesUrl = getFixturesUrl(query);

    for (let attempt = 0; attempt < maxFixturePolls; attempt++) {
      const cacheBust = `${fixturesUrl}${fixturesUrl.includes('?') ? '&' : '?'}t=${Date.now()}-${attempt}`;
      const { response: fixturesRes, data: fixturesData } = await fetchJsonWithTimeout(
        cacheBust,
        undefined,
        20000
      );

      if (!fixturesRes.ok) {
        setError(fixturesData.error || 'Failed to load fixtures');
        return false;
      }

      const fixtureCount = fixturesData.fixtures?.length || 0;
      setWeek(fixturesData.week || null);
      setFixtures(fixturesData.fixtures || []);

      if (fixturesData.week?.id) {
        await loadSelectionsForWeek(fixturesData.week.id);
      }

      if (fixtureCount > 0 || attempt === maxFixturePolls - 1) {
        await loadRounds();
        setLoadingMessage(`Fixture sync completed: ${fixtureCount} fixture${fixtureCount !== 1 ? 's' : ''}`);
        setTimeout(() => setLoadingMessage(''), 5000);
        return fixtureCount > 0;
      }

      setLoadingMessage('Workflow finished. Waiting for fixtures to appear...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return false;
  }, [getFixturesUrl, loadRounds, loadSelectionsForWeek]);

  const triggerFixtureSync = useCallback(async (query: RoundQuery) => {
    setRefreshing(true);
    setError(null);
    setLoadingMessage('Triggering fixture sync job...');

    try {
      let triggerPayload: Record<string, string | number | boolean>;
      if (query.mode === 'existing' && week) {
        triggerPayload = {
          targetDate: week.target_date,
          kickoffTime: week.target_kickoff_time,
          isCustom: week.is_custom,
          weekOffset: 0,
          enrich: enrichFixtures,
          enrichOdds,
        };
      } else if (query.mode === 'custom') {
        triggerPayload = {
          targetDate: query.targetDate,
          kickoffTime: query.kickoffTime,
          isCustom: true,
          enrich: enrichFixtures,
          enrichOdds,
        };
      } else {
        triggerPayload = {
          weekOffset: Math.max(0, query.mode === 'standard' ? query.weekOffset : 0),
          isCustom: false,
          enrich: enrichFixtures,
          enrichOdds,
        };
      }

      const triggerRes = await fetch('/api/fixtures/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(triggerPayload),
      });
      const triggerData = await triggerRes.json();

      if (!triggerRes.ok) {
        setError(triggerData.error || 'Failed to trigger fixture sync');
        setLoadingMessage('');
        return false;
      }

      const runId = triggerData.runId;
      if (!runId) {
        setLoadingMessage('Fixture sync started. Check back shortly for updates.');
        setTimeout(() => setLoadingMessage(''), 5000);
        return true;
      }

      setLoadingMessage('Fixture sync running in GitHub Actions...');

      const maxStatusPolls = 36;
      for (let i = 0; i < maxStatusPolls; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const statusRes = await fetch(`/api/fixtures/trigger-status?runId=${runId}`);
        const statusData = await statusRes.json();

        if (!statusRes.ok) {
          setError(statusData.error || 'Failed checking workflow status');
          setLoadingMessage('');
          return false;
        }

        if (statusData.status === 'completed') {
          if (statusData.conclusion !== 'success') {
            setError(`Fixture sync failed (${statusData.conclusion || 'unknown'})`);
            setLoadingMessage('');
            return false;
          }

          const loaded = await hydrateRoundFromFixtures(query);
          return loaded;
        }
      }

      setLoadingMessage('Fixture sync is still running. Check back shortly.');
      setTimeout(() => setLoadingMessage(''), 5000);
      return true;
    } catch (err) {
      setError('Network error, please try again');
      setLoadingMessage('');
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [enrichFixtures, enrichOdds, hydrateRoundFromFixtures, week]);

  useEffect(() => {
    fetchData(activeQuery);
  }, [fetchData, activeQuery]);

  useEffect(() => {
    loadRounds();
  }, [loadRounds]);

  useEffect(() => {
    if (!enrichFixtures && enrichOdds) {
      setEnrichOdds(false);
    }
  }, [enrichFixtures, enrichOdds]);

  const currentRoundIndex = week ? rounds.findIndex((round) => round.id === week.id) : -1;

  const handleNavigateRound = (direction: 'older' | 'newer') => {
    if (currentRoundIndex < 0) return;
    const nextIndex = direction === 'older' ? currentRoundIndex + 1 : currentRoundIndex - 1;
    const nextRound = rounds[nextIndex];
    if (!nextRound) return;

    setError(null);
    setActiveQuery({ mode: 'existing', weekId: nextRound.id });
  };

  const handlePreviousWeek = () => {
    handleNavigateRound('older');
  };

  const handleNextWeek = () => {
    handleNavigateRound('newer');
  };

  const handleLoadCustomRound = async () => {
    if (!customDate || !customKickoffTime) {
      setError('Choose a date and kick-off time first');
      return;
    }

    const nextQuery: RoundQuery = {
      mode: 'custom',
      targetDate: customDate,
      kickoffTime: customKickoffTime,
    };

    setLoading(true);
    setError(null);
    setActiveQuery(nextQuery);

    try {
      const { response: fixturesRes, data: fixturesData } = await fetchJsonWithTimeout(
        getFixturesUrl(nextQuery),
        undefined,
        20000
      );

      if (!fixturesRes.ok) {
        setError(fixturesData.error || 'Failed to load fixtures');
        return;
      }

      setWeek(fixturesData.week || null);
      setFixtures(fixturesData.fixtures || []);
      await loadRounds();
      if (fixturesData.week?.id) {
        await loadSelectionsForWeek(fixturesData.week.id);
      }

      if ((fixturesData.fixtures || []).length === 0) {
        await triggerFixtureSync(nextQuery);
      }
    } catch (err) {
      setError('Failed to load data. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSaturday = () => {
    setError(null);
    const matchingStandardRound = rounds.find(
      (round) =>
        round.week_number === week?.week_number &&
        round.season === week?.season &&
        !round.is_custom
    );

    if (matchingStandardRound) {
      setActiveQuery({ mode: 'existing', weekId: matchingStandardRound.id });
      return;
    }

    setActiveQuery({ mode: 'standard', weekOffset });
  };

  const handleRefreshFixtures = async () => {
    await triggerFixtureSync(activeQuery);
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

  const isCustomRound = Boolean(week?.is_custom);
  const roundLabel = week ? formatRoundLabel(week) : 'Week ?';
  const roundDateLabel = week ? formatDate(week.target_date) : '...';
  const roundKickoffLabel = week ? formatKickoffTimeLabel(week.target_kickoff_time) : '...';

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
                disabled={currentRoundIndex < 0 || currentRoundIndex >= rounds.length - 1}
                className="text-xl disabled:opacity-30 disabled:cursor-not-allowed hover:scale-110 transition-transform"
                title="Previous week"
              >
                ◀️
              </button>
              <h1 className="text-xl font-bold text-white">
                ⚽ {roundLabel}
              </h1>
              <button
                onClick={handleNextWeek}
                disabled={currentRoundIndex <= 0}
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
            {isCustomRound ? 'Custom' : 'Sat'} {roundDateLabel} • {roundKickoffLabel} KOs
          </p>
          <p className="text-emerald-400 text-xs">
            {fixtures.length} fixture{fixtures.length !== 1 ? 's' : ''} • Over 2.5 goals to win 💰
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-slate-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enrichFixtures}
                onChange={(event) => setEnrichFixtures(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
              />
              Enrich
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enrichOdds}
                onChange={(event) => setEnrichOdds(event.target.checked)}
                disabled={!enrichFixtures}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 disabled:opacity-40"
              />
              Odds
            </label>
          </div>
          <div className="pt-1">
            <button
              onClick={() => setShowCustomRoundMenu((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              <span className={`transition-transform ${showCustomRoundMenu ? 'rotate-90' : ''}`}>▶</span>
              Custom round
            </button>
          </div>
          {showCustomRoundMenu && (
            <div className="mt-2 rounded-xl border border-slate-700/80 bg-slate-900/45 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Date</p>
                  <div className="mt-1 text-xs text-slate-400">
                    {customDate ? formatDate(customDate) : 'Choose date'}
                  </div>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => {
                      setCustomDate(e.target.value);
                      e.currentTarget.blur();
                    }}
                    className="picker-input mt-2"
                  />
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Kick-off</p>
                  <div className="mt-1 text-xs text-slate-400">
                    {customKickoffTime || 'Choose time'}
                  </div>
                  <input
                    type="time"
                    value={customKickoffTime}
                    onChange={(e) => {
                      setCustomKickoffTime(e.target.value);
                      e.currentTarget.blur();
                    }}
                    className="picker-input mt-2"
                  />
                </div>
                <button
                  onClick={handleLoadCustomRound}
                  className="btn-secondary !py-2 whitespace-nowrap self-end"
                >
                  Load Week .5
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Create a quieter midweek round without leaving the main flow.
              </p>
            </div>
          )}
          {activeQuery.mode === 'custom' && (
            <button
              onClick={handleBackToSaturday}
              className="text-xs text-blue-400 hover:text-blue-300 text-left"
            >
              Back to Saturday rounds
            </button>
          )}
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
          onSelectionSubmitted={() => fetchData(activeQuery)}
        />
      )}

      {/* Weekly Reset */}
      {allPlayersPicked && week && <WeeklyReset weekId={week.id} onReset={() => fetchData(activeQuery)} />}
    </div>
  );
}

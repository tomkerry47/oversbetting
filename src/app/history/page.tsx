'use client';

import { useState, useEffect } from 'react';
import { Week, Selection, Fine, PLAYERS } from '@/types';
import { formatKickoffTimeLabel, formatRoundLabel } from '@/lib/utils';
import { DEFAULT_BET_STAKE } from '@/lib/odds';

type HistoryWeek = Week & {
  goals_scored: number;
  goals_target: number;
  goals_recorded: number;
  average_odds: number | null;
  odds_recorded: number;
  stake_amount: number;
  combined_odds: number | null;
  potential_return: number | null;
  group_bet_settled: boolean;
  unpriced_winner: boolean;
  total_staked: number;
  total_return: number;
  profit_loss: number;
};

type MatchStats = {
  shotsOnTarget: { home: number | null; away: number | null };
  shots: { home: number | null; away: number | null };
  xg: { home: number | null; away: number | null };
  possession: { home: number | null; away: number | null };
  corners: { home: number | null; away: number | null };
};

export default function HistoryPage() {
  const [weeks, setWeeks] = useState<HistoryWeek[]>([]);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [weekData, setWeekData] = useState<
    Record<number, { selections: Selection[]; fines: Fine[] }>
  >({});
  const [loading, setLoading] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState<number | null>(null);
  const [weekLoadErrors, setWeekLoadErrors] = useState<Record<number, string>>({});
  const [checkingResults, setCheckingResults] = useState<number | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  const [matchStats, setMatchStats] = useState<Record<number, MatchStats>>({});
  const [statsLoading, setStatsLoading] = useState<number | null>(null);
  const [statsErrors, setStatsErrors] = useState<Record<number, string>>({});
  const [stakeInput, setStakeInput] = useState(String(DEFAULT_BET_STAKE));

  useEffect(() => {
    const fetchWeeks = async () => {
      try {
        const res = await fetch('/api/history');
        const data = await res.json();
        setWeeks(data.weeks || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchWeeks();
  }, []);

  useEffect(() => {
    try {
      const savedStake = localStorage.getItem('historyGroupBetStake');
      const parsedStake = Number(savedStake);
      if (savedStake && Number.isFinite(parsedStake) && parsedStake > 0) {
        setStakeInput(String(parsedStake));
      }
    } catch {
      // Local storage may be unavailable in private browsing modes.
    }
  }, []);

  const loadWeekDetails = async (weekId: number) => {
    if (weekData[weekId]) {
      setExpandedWeek(expandedWeek === weekId ? null : weekId);
      return;
    }

    setLoadingWeek(weekId);
    setWeekLoadErrors((prev) => {
      const next = { ...prev };
      delete next[weekId];
      return next;
    });
    try {
      const res = await fetch(`/api/history?week_id=${weekId}`);
      const data = await res.json();
      if (!res.ok) {
        setWeekLoadErrors((prev) => ({
          ...prev,
          [weekId]: data.error || 'Failed to load week details',
        }));
        return;
      }
      setWeekData((prev) => ({
        ...prev,
        [weekId]: {
          selections: data.selections || [],
          fines: data.fines || [],
        },
      }));
      setExpandedWeek(weekId);
    } catch {
      setWeekLoadErrors((prev) => ({
        ...prev,
        [weekId]: 'Network error while loading week details',
      }));
    } finally {
      setLoadingWeek(null);
    }
  };

  const handleCheckResults = async (weekId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card collapse
    setCheckingResults(weekId);
    setCheckError(null);
    
    try {
      const res = await fetch('/api/results/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: weekId }),
      });
      const triggerData = await res.json().catch(() => ({}));
      if (res.ok) {
        // BSD-only rounds complete inline. Hybrid rounds still wait for the
        // GitHub/SofaScore workflow.
        const attempts = triggerData.mode === 'direct' ? 1 : 12;
        for (let i = 0; i < attempts; i++) {
          if (triggerData.mode !== 'direct') await new Promise((resolve) => setTimeout(resolve, 5000));
          const dataRes = await fetch(`/api/history?week_id=${weekId}`);
          const data = await dataRes.json();
          setWeekData((prev) => ({
            ...prev,
            [weekId]: {
              selections: data.selections || [],
              fines: data.fines || [],
            },
          }));

          if (data.week) {
            setWeeks((prev) =>
              prev.map((w) => (w.id === weekId ? data.week : w))
            );
          }
        }
        // Signal the stats page to refresh its insights.
        try { localStorage.setItem('resultsUpdatedAt', Date.now().toString()); } catch { /* ignore */ }
      } else {
        setCheckError(triggerData.error || 'Failed to trigger results workflow');
      }
    } catch {
      setCheckError('Network error while triggering results workflow');
    } finally {
      setCheckingResults(null);
    }
  };

  const toggleResultStats = async (selection: Selection, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selection.fixture) return;
    if (expandedResult === selection.id) {
      setExpandedResult(null);
      return;
    }
    setExpandedResult(selection.id);
    if (matchStats[selection.fixture.id] || statsLoading === selection.fixture.id) return;
    setStatsLoading(selection.fixture.id);
    setStatsErrors((previous) => {
      const next = { ...previous };
      delete next[selection.fixture!.id];
      return next;
    });
    try {
      const response = await fetch(`/api/match-stats/${selection.fixture.id}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Match statistics are unavailable');
      setMatchStats((previous) => ({ ...previous, [selection.fixture!.id]: body.stats }));
    } catch (cause: any) {
      setStatsErrors((previous) => ({
        ...previous,
        [selection.fixture!.id]: cause?.message || 'Match statistics are unavailable',
      }));
    } finally {
      setStatsLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-4xl animate-bounce">📅</div>
      </div>
    );
  }

  const getResultEmoji = (result: string) => {
    switch (result) {
      case 'won':
        return '✅';
      case 'lost':
        return '❌';
      default:
        return '⏳';
    }
  };

  const settledBets = weeks.filter((week) => week.group_bet_settled).length;
  const unpricedWinners = weeks.filter((week) => week.unpriced_winner).length;
  const parsedStake = Number(stakeInput);
  const stake = Number.isFinite(parsedStake) && parsedStake > 0 ? parsedStake : DEFAULT_BET_STAKE;
  const totalStaked = settledBets * stake;
  const totalReturn = weeks.reduce((total, week) => {
    if (!week.group_bet_settled || week.total_return <= 0 || week.stake_amount <= 0) return total;
    return total + (week.total_return / week.stake_amount) * stake;
  }, 0);
  const totalProfitLoss = Number((totalReturn - totalStaked).toFixed(2));

  const updateStake = (value: string) => {
    if (!/^\d*\.?\d{0,2}$/.test(value)) return;
    setStakeInput(value);
    const nextStake = Number(value);
    if (Number.isFinite(nextStake) && nextStake > 0) {
      try { localStorage.setItem('historyGroupBetStake', String(nextStake)); } catch { /* ignore */ }
    }
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-bold text-white">📅 History</h1>
        <p className="text-slate-400 text-xs mt-1">
          {weeks.length} saved round{weeks.length !== 1 ? 's' : ''}
        </p>
        {checkError && (
          <p className="text-red-400 text-xs mt-2">❌ {checkError}</p>
        )}
      </div>

      <section className="card" aria-label="Betting profit and loss">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Group bets profit / loss</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Based on {settledBets} settled group bet{settledBets === 1 ? '' : 's'}; one £{stake.toLocaleString('en-GB', { maximumFractionDigits: 2 })} accumulator per round.
              {unpricedWinners > 0 && ` ${unpricedWinners} winning round${unpricedWinners === 1 ? '' : 's'} excluded because odds were unavailable.`}
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
            Stake
            <span className="flex items-center rounded-lg border border-slate-600 bg-slate-900/70 px-2 py-1 text-sm text-white focus-within:border-emerald-500">
              £
              <input
                type="text"
                inputMode="decimal"
                value={stakeInput}
                onChange={(event) => updateStake(event.target.value)}
                onBlur={() => setStakeInput(String(stake))}
                className="w-12 bg-transparent text-right font-bold outline-none"
                aria-label="Group bet stake"
              />
            </span>
          </label>
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <p className={`mt-1 text-2xl font-black ${totalProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalProfitLoss >= 0 ? '+' : '-'}£{Math.abs(totalProfitLoss).toFixed(2)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-xs">
            <span className="text-slate-500">Staked</span>
            <span className="font-semibold text-white">£{totalStaked.toFixed(2)}</span>
            <span className="text-slate-500">Returned</span>
            <span className="font-semibold text-white">£{totalReturn.toFixed(2)}</span>
          </div>
        </div>
      </section>

      {weeks.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-slate-400">
            No completed weeks yet ⚽
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {weeks.map((week) => {
            const isExpanded = expandedWeek === week.id;
            const data = weekData[week.id];

            return (
              <div
                key={week.id}
                className="card cursor-pointer transition-all active:scale-[0.98]"
              >
                <div onClick={() => loadWeekDetails(week.id)}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-white">
                        {formatRoundLabel(week)}
                        {week.status === 'active' && (
                          <span className="text-xs text-emerald-400 ml-2">● Active</span>
                        )}
                        {week.status === 'completed' && (
                          <span className="text-xs text-blue-400 ml-2">✓ Completed</span>
                        )}
                        {week.goals_target > 0 && (
                          <span
                            className={`text-xs ml-2 ${
                              week.goals_recorded === 0
                                ? 'text-slate-400'
                                : week.goals_scored >= week.goals_target
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                            }`}
                          >
                            ⚽ {week.goals_recorded === 0
                              ? 'Goals pending'
                              : `${week.goals_scored}/${week.goals_target} goals`}
                          </span>
                        )}
                      </h3>
                      {week.average_odds !== null && (
                        <p
                          className="mt-1 text-xs font-semibold text-violet-300"
                          title={`${week.odds_recorded} priced selection${week.odds_recorded === 1 ? '' : 's'}`}
                        >
                          📈 {week.average_odds.toFixed(2)} avg odds
                          {week.potential_return !== null && (
                            <span className="ml-2 text-emerald-300">
                              • £{stake.toLocaleString('en-GB', { maximumFractionDigits: 2 })} group return £{((week.potential_return / week.stake_amount) * stake).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </p>
                      )}
                      <p className="mt-0.5 text-slate-400 text-xs">
                        {new Date(week.target_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })} • {formatKickoffTimeLabel(week.target_kickoff_time)}
                      </p>
                    </div>
                    <span className="text-2xl transition-transform duration-200"
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      ▾
                    </span>
                  </div>
                </div>

                {loadingWeek === week.id && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <p className="text-slate-400 text-xs text-center py-2">Loading picks...</p>
                  </div>
                )}

                {weekLoadErrors[week.id] && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <p className="text-red-400 text-xs">❌ {weekLoadErrors[week.id]}</p>
                  </div>
                )}

                {isExpanded && data && (
                  <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                    {PLAYERS.map((player) => {
                      const playerSelections = data.selections.filter(
                        (s) => s.player_name === player
                      );
                      const playerFines = data.fines.filter(
                        (f) => f.player_name === player
                      );

                      if (playerSelections.length === 0) return null;

                      return (
                        <div
                          key={player}
                          className="p-2.5 rounded-xl bg-slate-900/50"
                        >
                          <h4 className="font-medium text-emerald-400 mb-1.5 text-sm">
                            {player}
                          </h4>
                          <div className="space-y-1">
                            {playerSelections.map((sel) => {
                              const fixtureId = sel.fixture?.id;
                              const isStatsExpanded = expandedResult === sel.id;
                              const stats = fixtureId ? matchStats[fixtureId] : undefined;
                              const rows = stats ? [
                                ['Shots on target', stats.shotsOnTarget, ''],
                                ['Total shots', stats.shots, ''],
                                ['xG', stats.xg, ''],
                                ['Possession', stats.possession, '%'],
                                ['Corners', stats.corners, ''],
                              ] as const : [];
                              const visibleRows = rows.filter(([, values]) => values.home !== null || values.away !== null);
                              return (
                                <div key={sel.id} className="rounded-lg overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={(event) => toggleResultStats(sel, event)}
                                    className={`w-full flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-2 text-left transition-colors ${isStatsExpanded ? 'bg-slate-700/70' : 'hover:bg-slate-800'}`}
                                  >
                                    <span className="text-slate-300 truncate">
                                      {getResultEmoji(sel.result)}{' '}
                                      {sel.fixture?.is_star_pick ? '⭐ ' : ''}
                                      {sel.fixture?.home_team} vs {sel.fixture?.away_team}
                                    </span>
                                    <span className="text-slate-400 flex-shrink-0 flex items-center gap-2">
                                      {sel.fixture?.home_score !== null
                                        ? `${sel.fixture?.home_score}-${sel.fixture?.away_score}`
                                        : '-'}
                                      <span className={`transition-transform ${isStatsExpanded ? 'rotate-180' : ''}`}>⌄</span>
                                    </span>
                                  </button>
                                  {isStatsExpanded && fixtureId && (
                                    <div className="mx-2 mb-2 rounded-b-lg border border-t-0 border-slate-700 bg-slate-950/60 p-3">
                                      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-[10px] font-semibold text-slate-400 mb-2">
                                        <span className="truncate text-left">{sel.fixture?.home_team}</span>
                                        <span>Match stats</span>
                                        <span className="truncate text-right">{sel.fixture?.away_team}</span>
                                      </div>
                                      {statsLoading === fixtureId && <p className="py-3 text-center text-xs text-slate-500">Loading match stats…</p>}
                                      {statsErrors[fixtureId] && <p className="py-2 text-center text-xs text-amber-400">{statsErrors[fixtureId]}</p>}
                                      {stats && visibleRows.length === 0 && <p className="py-2 text-center text-xs text-slate-500">No detailed statistics were recorded for this match.</p>}
                                      <div className="space-y-1.5">
                                        {visibleRows.map(([label, values, suffix]) => (
                                          <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                                            <span className="text-left font-semibold text-white">{values.home ?? '–'}{values.home !== null ? suffix : ''}</span>
                                            <span className="text-slate-400">{label}</span>
                                            <span className="text-right font-semibold text-white">{values.away ?? '–'}{values.away !== null ? suffix : ''}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {playerFines.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-700">
                              {playerFines.map((fine) => (
                                <div
                                  key={fine.id}
                                  className="text-xs text-amber-400"
                                >
                                  💰 £{parseFloat(String(fine.amount)).toFixed(2)} -{' '}
                                  {fine.reason}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {data.selections.length === 0 && (
                      <p className="text-slate-500 text-xs text-center py-1">
                        No picks recorded for this round yet.
                      </p>
                    )}
                    
                    {/* Check Results Button - at bottom, subtle for completed weeks */}
                    {data.selections.length > 0 && (
                      <button
                        onClick={(e) => handleCheckResults(week.id, e)}
                        disabled={checkingResults === week.id}
                        className={`w-full py-2 text-xs rounded-lg transition-all ${
                          week.status === 'completed'
                            ? 'bg-slate-700 text-slate-400 hover:bg-slate-600 mt-2'
                            : 'btn-gold text-sm'
                        }`}
                      >
                        {checkingResults === week.id ? 'Checking...' : '🔍 Re-check Results'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { PlayerStats, PLAYERS, MAX_SELECTIONS_PER_PLAYER } from '@/types';
import { formatKickoffTimeLabel, formatRoundLabel } from '@/lib/utils';

interface WeeklyBreakdown {
  week: {
    id: number;
    week_number: number;
    target_date: string;
    target_kickoff_time: string;
    is_custom: boolean;
    status: string;
  };
  selections: Array<{
    player_name: string;
    result: string;
    total_goals: number | null;
    fixture: {
      home_team: string;
      away_team: string;
      home_score: number | null;
      away_score: number | null;
    };
  }>;
  fines: Array<{
    player_name: string;
    amount: number;
    reason: string;
  }>;
  player_results: Record<string, { wins: number; losses: number; pending: number }>;
}

export default function StatsPage() {
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [weeklyBreakdown, setWeeklyBreakdown] = useState<WeeklyBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'30' | '90' | 'all'>('all');

  useEffect(() => {
    let lastFetchAt = 0;

    const fetchStats = async () => {
      lastFetchAt = Date.now();
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (timeFilter !== 'all') {
          params.append('days', timeFilter);
        }
        
        const res = await fetch(`/api/stats?${params.toString()}`);
        const data = await res.json();
        setStats(data.stats || []);
        setWeeklyBreakdown(data.weeklyBreakdown || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchStats();

    // Re-fetch when another browser tab signals that results have been checked.
    // The storage event only fires in tabs other than the one that wrote the value,
    // so this handles the multi-tab scenario.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'resultsUpdatedAt') fetchStats();
    };

    // Re-fetch when the user switches back to this browser tab, but only if
    // results were updated more recently than the last fetch.
    const handleVisibility = () => {
      if (document.hidden) return;
      try {
        const updatedAt = parseInt(localStorage.getItem('resultsUpdatedAt') || '0', 10);
        if (updatedAt > lastFetchAt) fetchStats();
      } catch {
        // ignore – localStorage may not be accessible
      }
    };

    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [timeFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-4xl animate-bounce">📊</div>
      </div>
    );
  }

  const getBarWidth = (value: number, max: number) =>
    max > 0 ? (value / max) * 100 : 0;

  const maxSelections = Math.max(...stats.map((s) => s.total_selections), 1);
  const maxWins = Math.max(...stats.map((s) => s.wins), 1);

  // Determine leader
  const leader = [...stats].sort(
    (a, b) => b.win_rate - a.win_rate || b.wins - a.wins
  )[0];

  const hottestStreak = [...stats].sort(
    (a, b) => b.current_streak - a.current_streak || b.best_streak - a.best_streak
  )[0];
  const coldestRun = [...stats].sort(
    (a, b) => b.losses - a.losses || a.win_rate - b.win_rate
  )[0];
  const goalMachine = [...stats].sort(
    (a, b) => b.avg_goals - a.avg_goals || b.wins - a.wins
  )[0];
  const fineMagnet = [...stats].sort(
    (a, b) => b.outstanding_fines - a.outstanding_fines || b.total_fines - a.total_fines
  )[0];

  const getRoundSpanForPickStreak = (
    playerName: string,
    mode: 'wins' | 'losses',
    targetPickCount: number
  ) => {
    let rounds = 0;
    let picksCovered = 0;
    let started = false;

    for (const wb of weeklyBreakdown) {
      const pr = wb.player_results[playerName];
      if (!pr) {
        if (started) break;
        continue;
      }

      const matchingPicks = mode === 'wins' ? pr.wins : pr.losses;
      const opposingPicks = mode === 'wins' ? pr.losses : pr.wins;

      if (!started && matchingPicks === 0) {
        continue;
      }

      if (matchingPicks === 0 || opposingPicks > 0) {
        break;
      }

      started = true;
      rounds++;
      picksCovered += matchingPicks;

      if (picksCovered >= targetPickCount) {
        break;
      }
    }

    return Math.max(rounds, Math.ceil(targetPickCount / MAX_SELECTIONS_PER_PLAYER));
  };

  const insights = [
    hottestStreak && hottestStreak.current_streak > 1
      ? {
          title: 'Hottest Streak',
          value: `${hottestStreak.current_streak} pick wins`,
          detail: `${hottestStreak.player_name} is on a proper heater: ${hottestStreak.current_streak} straight picks across ${getRoundSpanForPickStreak(hottestStreak.player_name, 'wins', hottestStreak.current_streak)} round${getRoundSpanForPickStreak(hottestStreak.player_name, 'wins', hottestStreak.current_streak) === 1 ? '' : 's'}.`,
          tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
        }
      : leader
      ? {
          title: 'Top Dog',
          value: `${leader.win_rate}% win rate`,
          detail: `${leader.player_name} is setting the pace right now.`,
          tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
        }
      : null,
    coldestRun && coldestRun.losses > 1
      ? {
          title: 'Coldest Streak',
          value: `${coldestRun.losses} pick losses`,
          detail: `${coldestRun.player_name} is in a rut: ${coldestRun.losses} straight losses across ${getRoundSpanForPickStreak(coldestRun.player_name, 'losses', coldestRun.losses)} round${getRoundSpanForPickStreak(coldestRun.player_name, 'losses', coldestRun.losses) === 1 ? '' : 's'}.`,
          tone: 'text-red-300 border-red-500/30 bg-red-500/10',
        }
      : null,
    goalMachine && goalMachine.avg_goals > 0
      ? {
          title: 'Goal Machine',
          value: `${goalMachine.avg_goals.toFixed(1)} goals avg`,
          detail: `${goalMachine.player_name}'s picks are serving chaos.`,
          tone: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
        }
      : null,
    fineMagnet && fineMagnet.outstanding_fines > 0
      ? {
          title: 'Fine Magnet',
          value: `£${fineMagnet.outstanding_fines.toFixed(0)} owed`,
          detail: `${fineMagnet.player_name} is carrying the biggest tab.`,
          tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    value: string;
    detail: string;
    tone: string;
  }>;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-white">📊 Player Stats</h1>
            <p className="text-slate-400 text-xs mt-1">Performance across all weeks</p>
          </div>
        </div>
        
        {/* Time Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setTimeFilter('30')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              timeFilter === '30'
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setTimeFilter('90')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              timeFilter === '90'
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            90 Days
          </button>
          <button
            onClick={() => setTimeFilter('all')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              timeFilter === 'all'
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-white">🔎 Insights</h2>
              <p className="text-slate-400 text-xs mt-1">The standout stat lines at a glance</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {insights.map((insight) => (
              <div
                key={insight.title}
                className={`rounded-xl border p-3 ${insight.tone}`}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">
                  {insight.title}
                </div>
                <div className="mt-1 text-lg font-bold text-white">
                  {insight.value}
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  {insight.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="card">
        <h2 className="text-base font-semibold text-white mb-3">🏆 Leaderboard</h2>
        <div className="space-y-3">
          {[...stats]
            .sort((a, b) => b.win_rate - a.win_rate || b.wins - a.wins)
            .map((stat, idx) => (
              <div
                key={stat.player_name}
                className={`p-3 rounded-xl border transition-all cursor-pointer active:scale-[0.98] ${
                  selectedPlayer === stat.player_name
                    ? 'border-emerald-500 bg-emerald-900/20'
                    : 'border-slate-700 bg-slate-800/50'
                } ${idx === 0 ? 'ring-1 ring-amber-500/30' : ''}`}
                onClick={() =>
                  setSelectedPlayer(
                    selectedPlayer === stat.player_name
                      ? null
                      : stat.player_name
                  )
                }
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {idx === 0
                        ? '🥇'
                        : idx === 1
                        ? '🥈'
                        : idx === 2
                        ? '🥉'
                        : '4️⃣'}
                    </span>
                    <div>
                      <h3 className="font-semibold text-white text-sm">
                        {stat.player_name}
                      </h3>
                      <p className="text-slate-400 text-[10px]">
                        {stat.total_selections} picks
                        {stat.current_streak > 0
                          ? ` • 🔥 ${stat.current_streak} streak`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-emerald-400">
                      {stat.win_rate}%
                    </div>
                    <div className="text-slate-500 text-[10px]">win rate</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-emerald-400 font-bold text-base">
                      {stat.wins}
                    </div>
                    <div className="text-slate-500 text-[10px]">Wins</div>
                    <div className="mt-0.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{
                          width: `${getBarWidth(stat.wins, maxWins)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-red-400 font-bold text-base">
                      {stat.losses}
                    </div>
                    <div className="text-slate-500 text-[10px]">Losses</div>
                    <div className="mt-0.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full"
                        style={{
                          width: `${getBarWidth(
                            stat.losses,
                            stat.total_selections
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-400 font-bold text-base">
                      {stat.avg_goals.toFixed(1)}
                    </div>
                    <div className="text-slate-500 text-[10px]">Avg Goals</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2 text-center">
                  <div className="bg-slate-900/50 rounded-lg p-1.5">
                    <div className="text-amber-400 font-bold text-sm">
                      £{stat.outstanding_fines.toFixed(0)}
                    </div>
                    <div className="text-slate-500 text-[10px]">Fines</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-1.5">
                    <div className="text-slate-300 font-bold text-sm">
                      {stat.total_selections}
                    </div>
                    <div className="text-slate-500 text-[10px]">Picks</div>
                  </div>
                </div>

                {stat.best_streak > 0 && (
                  <div className="mt-1.5 text-[10px] text-slate-500">
                    Best streak: {stat.best_streak} 🔥
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Weekly Breakdown */}
      {weeklyBreakdown.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold text-white mb-3">
            📅 Weekly Breakdown
          </h2>
          <div className="space-y-2">
            {weeklyBreakdown.map((wb) => (
              <div
                key={wb.week.id}
                className="p-3 rounded-xl border border-slate-700 bg-slate-800/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-white text-sm">
                    {formatRoundLabel(wb.week)}
                  </h3>
                  <span className="text-slate-400 text-[10px]">
                    {new Date(wb.week.target_date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })} • {formatKickoffTimeLabel(wb.week.target_kickoff_time)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {PLAYERS.map((player) => {
                    const pr = wb.player_results[player];
                    if (!pr) {
                      return (
                        <div
                          key={player}
                          className="text-center p-1.5 rounded-lg bg-slate-900/50 text-slate-500 text-[10px]"
                        >
                          {player}: -
                        </div>
                      );
                    }
                    return (
                      <div
                        key={player}
                        className="text-center p-1.5 rounded-lg bg-slate-900/50"
                      >
                        <div className="text-xs font-medium text-white">
                          {player}
                        </div>
                        <div className="text-[10px] mt-0.5">
                          <span className="text-emerald-400">{pr.wins}W</span>
                          {' '}
                          <span className="text-red-400">{pr.losses}L</span>
                          {pr.pending > 0 && (
                            <>
                              {' '}
                              <span className="text-amber-400">
                                {pr.pending}P
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Week fines */}
                {wb.fines.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <div className="text-xs text-amber-400">
                      💰 Fines:{' '}
                      {wb.fines.map((f, i) => (
                        <span key={i}>
                          {f.player_name} £{f.amount} ({f.reason})
                          {i < wb.fines.length - 1 ? ' • ' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.every((s) => s.total_selections === 0) && (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-lg">
            No stats yet. Start making picks! ⚽
          </p>
        </div>
      )}
    </div>
  );
}

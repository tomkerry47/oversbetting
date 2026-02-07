'use client';

import { useState, useEffect } from 'react';
import { PlayerStats, PLAYERS } from '@/types';

interface WeeklyBreakdown {
  week: {
    id: number;
    week_number: number;
    saturday_date: string;
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

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
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
  }, []);

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

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-bold text-white">📊 Player Stats</h1>
        <p className="text-slate-400 text-xs mt-1">Performance across all weeks</p>
      </div>

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
                    <div className="text-amber-400 font-bold text-base">
                      £{stat.outstanding_fines.toFixed(0)}
                    </div>
                    <div className="text-slate-500 text-[10px]">Fines</div>
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
                    Week {wb.week.week_number}
                  </h3>
                  <span className="text-slate-400 text-[10px]">
                    {new Date(wb.week.saturday_date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
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

'use client';

import { useState, useEffect } from 'react';
import { Week, Selection, Fine, PLAYERS } from '@/types';

export default function HistoryPage() {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [weekData, setWeekData] = useState<
    Record<number, { selections: Selection[]; fines: Fine[] }>
  >({});
  const [loading, setLoading] = useState(true);

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

  const loadWeekDetails = async (weekId: number) => {
    if (weekData[weekId]) {
      setExpandedWeek(expandedWeek === weekId ? null : weekId);
      return;
    }

    try {
      const res = await fetch(`/api/history?week_id=${weekId}`);
      const data = await res.json();
      setWeekData((prev) => ({
        ...prev,
        [weekId]: {
          selections: data.selections || [],
          fines: data.fines || [],
        },
      }));
      setExpandedWeek(weekId);
    } catch {
      // ignore
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

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold text-white">📅 Week History</h1>
        <p className="text-slate-400 mt-1">
          {weeks.length} completed week{weeks.length !== 1 ? 's' : ''}
        </p>
      </div>

      {weeks.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-lg">
            No completed weeks yet. Check back after your first Saturday! ⚽
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {weeks.map((week) => {
            const isExpanded = expandedWeek === week.id;
            const data = weekData[week.id];

            return (
              <div
                key={week.id}
                className="card cursor-pointer transition-all"
                onClick={() => loadWeekDetails(week.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Week {week.week_number}
                    </h3>
                    <p className="text-slate-400 text-sm">
                      {new Date(week.saturday_date).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
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

                {isExpanded && data && (
                  <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
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
                          className="p-3 rounded-lg bg-slate-900/50"
                        >
                          <h4 className="font-medium text-emerald-400 mb-2">
                            {player}
                          </h4>
                          <div className="space-y-1">
                            {playerSelections.map((sel) => (
                              <div
                                key={sel.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-slate-300">
                                  {getResultEmoji(sel.result)}{' '}
                                  {sel.fixture?.home_team} vs{' '}
                                  {sel.fixture?.away_team}
                                </span>
                                <span className="text-slate-400">
                                  {sel.fixture?.home_score !== null
                                    ? `${sel.fixture?.home_score}-${sel.fixture?.away_score}`
                                    : '-'}
                                  {sel.total_goals !== null && (
                                    <span className="ml-1 text-xs">
                                      ({sel.total_goals} goals)
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
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

'use client';

import { useState, useEffect } from 'react';
import { Fine, PLAYERS } from '@/types';

interface FineSummary {
  total: number;
  outstanding: number;
  cleared: number;
}

export default function FinesPage() {
  const [fines, setFines] = useState<Fine[]>([]);
  const [summary, setSummary] = useState<Record<string, FineSummary>>({});
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);

  const fetchFines = async () => {
    try {
      const res = await fetch('/api/fines');
      const data = await res.json();
      setFines(data.fines || []);
      setSummary(data.summary || {});
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFines();
  }, []);

  const handleClearPlayer = async (player: string) => {
    setClearing(player);
    try {
      await fetch('/api/fines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: player }),
      });
      await fetchFines();
      setShowConfirm(null);
    } finally {
      setClearing(null);
    }
  };

  const handleClearAll = async () => {
    setClearing('all');
    try {
      await fetch('/api/fines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await fetchFines();
      setShowConfirm(null);
    } finally {
      setClearing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-4xl animate-bounce">💰</div>
      </div>
    );
  }

  const totalOutstanding = Object.values(summary).reduce(
    (sum, s) => sum + s.outstanding,
    0
  );

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">💰 Fines Tracker</h1>
            <p className="text-slate-400 mt-1">
              0-0 = £5 • 1 goal = £2 • Both games 0-0 = £20
            </p>
          </div>
          {totalOutstanding > 0 && (
            <div className="text-right">
              <div className="text-2xl font-bold text-amber-400">
                £{totalOutstanding.toFixed(2)}
              </div>
              <div className="text-slate-400 text-sm">total outstanding</div>
            </div>
          )}
        </div>
      </div>

      {/* Player Fine Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLAYERS.map((player) => {
          const playerSummary = summary[player] || {
            total: 0,
            outstanding: 0,
            cleared: 0,
          };
          const playerFines = fines.filter(
            (f) => f.player_name === player && !f.cleared
          );

          return (
            <div key={player} className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">{player}</h3>
                <div
                  className={`text-xl font-bold ${
                    playerSummary.outstanding > 0
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  £{playerSummary.outstanding.toFixed(2)}
                </div>
              </div>

              {/* Fine breakdown */}
              {playerFines.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {playerFines.map((fine) => (
                    <div
                      key={fine.id}
                      className="flex items-center justify-between bg-slate-900/50 rounded p-2 text-sm"
                    >
                      <span className="text-slate-300">{fine.reason}</span>
                      <span className="text-amber-400 font-medium">
                        £{parseFloat(String(fine.amount)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm mb-3">No outstanding fines ✅</p>
              )}

              {/* Summary row */}
              <div className="flex justify-between text-xs text-slate-500 pt-2 border-t border-slate-700">
                <span>Total all-time: £{playerSummary.total.toFixed(2)}</span>
                <span>Cleared: £{playerSummary.cleared.toFixed(2)}</span>
              </div>

              {/* Clear button */}
              {playerSummary.outstanding > 0 && (
                <div className="mt-3">
                  {showConfirm === player ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowConfirm(null)}
                        className="btn-secondary text-xs flex-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleClearPlayer(player)}
                        disabled={clearing === player}
                        className="btn-primary text-xs flex-1"
                      >
                        {clearing === player
                          ? 'Clearing...'
                          : `Clear £${playerSummary.outstanding.toFixed(2)}`}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowConfirm(player)}
                      className="btn-secondary text-xs w-full"
                    >
                      Mark as Paid
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Clear All */}
      {totalOutstanding > 0 && (
        <div className="card border-red-500/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-red-400">
                Clear All Fines
              </h3>
              <p className="text-slate-400 text-sm">
                Mark all £{totalOutstanding.toFixed(2)} as paid
              </p>
            </div>
            {showConfirm === 'all' ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={clearing === 'all'}
                  className="btn-danger"
                >
                  {clearing === 'all' ? 'Clearing...' : 'Confirm Clear All'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirm('all')}
                className="btn-danger"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}

      {fines.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-lg">No fines yet. Clean sheet! 🧤</p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Week } from '@/types';
import { getRoundResultsAvailableAt } from '@/lib/utils';

interface ResultsCheckerProps {
  onResultsChecked: () => Promise<void>;
  hasSelections: boolean;
  weekId?: number;
  week?: Pick<Week, 'target_date' | 'target_kickoff_time'>;
}

export default function ResultsChecker({ onResultsChecked, hasSelections, weekId, week }: ResultsCheckerProps) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canCheck, setCanCheck] = useState(false);
  const [timeUntilCheck, setTimeUntilCheck] = useState<string>('');

  useEffect(() => {
    const checkTime = () => {
      if (!week) {
        setCanCheck(true);
        setTimeUntilCheck('');
        return;
      }

      const availableAt = getRoundResultsAvailableAt(week.target_date, week.target_kickoff_time);
      const diffMs = availableAt.getTime() - Date.now();
      if (diffMs <= 0) {
        setCanCheck(true);
        setTimeUntilCheck('');
        return;
      }

      const totalMinutes = Math.ceil(diffMs / 60000);
      const hoursLeft = Math.floor(totalMinutes / 60);
      const minsLeft = totalMinutes % 60;
      setCanCheck(false);
      setTimeUntilCheck(`${hoursLeft}h ${minsLeft}m until results`);
    };

    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, [week]);

  const handleCheck = async () => {
    setChecking(true);
    setError(null);

    try {
      const res = await fetch('/api/results/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: weekId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to trigger results check');
        return;
      }

      // Poll for up to 45s so users can see updated results without manual refresh.
      for (let i = 0; i < 9; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await onResultsChecked();
      }
    } catch {
      setError('Network error, please try again');
    } finally {
      setChecking(false);
    }
  };

  if (!hasSelections) return null;

  return (
    <div className="card">
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white">🔍 Check Results</h3>
          {timeUntilCheck && (
            <p className="text-amber-400 text-xs mt-1">⏰ {timeUntilCheck}</p>
          )}
          {canCheck && (
            <p className="text-emerald-400 text-xs mt-1">
              Results available! Hit the button.
            </p>
          )}
        </div>
        <button
          onClick={handleCheck}
          disabled={!canCheck || checking}
          className="btn-gold w-full py-4 text-base"
        >
          {checking ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                ></path>
              </svg>
              Checking...
            </span>
          ) : (
            '🏆 Check Results'
          )}
        </button>
      </div>
      {error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs">
          ❌ {error}
        </div>
      )}
    </div>
  );
}

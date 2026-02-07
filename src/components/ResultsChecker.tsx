'use client';

import { useState, useEffect } from 'react';

interface ResultsCheckerProps {
  onResultsChecked: () => void;
  hasSelections: boolean;
}

export default function ResultsChecker({ onResultsChecked, hasSelections }: ResultsCheckerProps) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canCheck, setCanCheck] = useState(false);
  const [timeUntilCheck, setTimeUntilCheck] = useState<string>('');

  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      // Create a UK time check
      const ukTime = new Date(
        now.toLocaleString('en-US', { timeZone: 'Europe/London' })
      );
      const day = ukTime.getDay(); // 0=Sun, 6=Sat
      const hour = ukTime.getHours();

      if (day === 6 && hour >= 17) {
        // Saturday after 17:00
        setCanCheck(true);
        setTimeUntilCheck('');
      } else if (day === 6 && hour < 17) {
        // Saturday before 17:00
        const hoursLeft = 16 - hour;
        const minsLeft = 59 - ukTime.getMinutes();
        setCanCheck(false);
        setTimeUntilCheck(`${hoursLeft}h ${minsLeft}m until results`);
      } else {
        // Any other day - allow checking for testing & late checks
        setCanCheck(true);
        setTimeUntilCheck('');
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleCheck = async () => {
    setChecking(true);
    setError(null);

    try {
      const res = await fetch('/api/results', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to check results');
        return;
      }

      onResultsChecked();
    } catch {
      setError('Network error, please try again');
    } finally {
      setChecking(false);
    }
  };

  if (!hasSelections) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">🔍 Check Results</h3>
          {timeUntilCheck && (
            <p className="text-amber-400 text-sm mt-1">⏰ {timeUntilCheck}</p>
          )}
          {canCheck && (
            <p className="text-emerald-400 text-sm mt-1">
              Results available! Hit the button to check.
            </p>
          )}
        </div>
        <button
          onClick={handleCheck}
          disabled={!canCheck || checking}
          className="btn-gold"
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
        <div className="mt-3 bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm">
          ❌ {error}
        </div>
      )}
    </div>
  );
}

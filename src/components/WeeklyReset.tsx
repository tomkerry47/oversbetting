'use client';

import { useState } from 'react';

interface WeeklyResetProps {
  weekId: number;
  onReset: () => void;
}

export default function WeeklyReset({ weekId, onReset }: WeeklyResetProps) {
  const [resetting, setResetting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: weekId }),
      });
      if (res.ok) {
        onReset();
        setShowConfirm(false);
      }
    } catch {
      // ignore
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="card border-amber-500/30">
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-amber-400">🔄 New Week</h3>
          <p className="text-slate-400 text-xs mt-1">
            Mark this round complete and move on
          </p>
        </div>
        {!showConfirm ? (
          <button onClick={() => setShowConfirm(true)} className="btn-secondary w-full">
            Reset Week
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setShowConfirm(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button onClick={handleReset} disabled={resetting} className="btn-danger flex-1">
              {resetting ? 'Resetting...' : 'Confirm Reset'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

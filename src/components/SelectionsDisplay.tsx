'use client';

import { Selection, PLAYERS } from '@/types';
import { formatSelectionsForCopy } from '@/lib/utils';
import { useState } from 'react';

interface SelectionsDisplayProps {
  selections: Selection[];
}

export default function SelectionsDisplay({ selections }: SelectionsDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (selections.length === 0) {
    return null;
  }

  const grouped = PLAYERS.reduce<Record<string, Selection[]>>((acc, player) => {
    acc[player] = selections.filter((s) => s.player_name === player);
    return acc;
  }, {});

  const handleCopy = async () => {
    const text = formatSelectionsForCopy(selections);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'won':
        return <span className="badge-won">✅ WON</span>;
      case 'lost':
        return <span className="badge-lost">❌ LOST</span>;
      default:
        return <span className="badge-pending">⏳ Pending</span>;
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">📋 This Week&apos;s Picks</h3>
        <button onClick={handleCopy} className="btn-secondary text-sm">
          {copied ? '✅ Copied!' : '📋 Copy All'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLAYERS.map((player) => {
          const playerPicks = grouped[player];
          if (!playerPicks || playerPicks.length === 0) {
            return (
              <div key={player} className="card-compact bg-slate-900/50">
                <h4 className="font-semibold text-slate-400 mb-2">{player}</h4>
                <p className="text-slate-500 text-sm italic">No picks yet</p>
              </div>
            );
          }

          return (
            <div key={player} className="card-compact bg-slate-900/50">
              <h4 className="font-semibold text-emerald-400 mb-3">{player}</h4>
              <div className="space-y-2">
                {playerPicks.map((sel) => (
                  <div
                    key={sel.id}
                    className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2"
                  >
                    <div className="text-sm">
                      <span className="text-white font-medium">
                        {sel.fixture?.home_team}
                      </span>
                      <span className="text-slate-400 mx-1">vs</span>
                      <span className="text-white font-medium">
                        {sel.fixture?.away_team}
                      </span>
                      {sel.fixture?.home_score !== null &&
                        sel.fixture?.away_score !== null && (
                          <span className="text-amber-400 ml-2 font-bold">
                            ({sel.fixture?.home_score}-{sel.fixture?.away_score})
                          </span>
                        )}
                    </div>
                    <div>{getResultBadge(sel.result)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

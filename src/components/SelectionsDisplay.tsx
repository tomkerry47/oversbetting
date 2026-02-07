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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-white">📋 This Week&apos;s Picks</h3>
        <button onClick={handleCopy} className="btn-secondary !py-2 !px-3 text-xs">
          {copied ? '✅ Copied!' : '📋 Copy'}
        </button>
      </div>

      <div className="space-y-2">
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
              <h4 className="font-semibold text-emerald-400 mb-2 text-sm">{player}</h4>
              <div className="space-y-1.5">
                {playerPicks.map((sel) => (
                  <div
                    key={sel.id}
                    className="bg-slate-800/50 rounded-lg p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs min-w-0 flex-1">
                        <div className="text-white font-medium truncate">
                          {sel.fixture?.home_team}
                        </div>
                        <div className="text-white font-medium truncate">
                          <span className="text-slate-500 mr-1">vs</span>
                          {sel.fixture?.away_team}
                        </div>
                        {sel.fixture?.home_score !== null &&
                          sel.fixture?.away_score !== null && (
                            <div className="text-amber-400 font-bold mt-0.5">
                              {sel.fixture?.home_score}-{sel.fixture?.away_score}
                              {sel.total_goals !== null && (
                                <span className="text-slate-400 font-normal ml-1">({sel.total_goals} goals)</span>
                              )}
                            </div>
                          )}
                      </div>
                      <div className="flex-shrink-0 mt-0.5">{getResultBadge(sel.result)}</div>
                    </div>
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

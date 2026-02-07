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
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700">✅ WON</span>;
      case 'lost':
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700">❌ LOST</span>;
      default:
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 border border-slate-600">⏳ Pending</span>;
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

      <div className="grid grid-cols-2 gap-2">
        {PLAYERS.map((player) => {
          const playerPicks = grouped[player];
          if (!playerPicks || playerPicks.length === 0) {
            return (
              <div key={player} className="card-compact bg-slate-900/50">
                <h4 className="font-semibold text-slate-400 mb-1.5 text-xs">{player}</h4>
                <p className="text-slate-500 text-[10px] italic">No picks</p>
              </div>
            );
          }

          return (
            <div key={player} className="card-compact bg-slate-900/50">
              <h4 className="font-semibold text-emerald-400 mb-1.5 text-xs">{player}</h4>
              <div className="space-y-1">
                {playerPicks.map((sel) => (
                  <div
                    key={sel.id}
                    className="bg-slate-800/50 rounded-lg p-1.5 flex items-start justify-between gap-1.5"
                  >
                    <div className="text-[10px] min-w-0 flex-1">
                      <div className="text-white font-medium truncate leading-tight">
                        {sel.fixture?.home_team}
                      </div>
                      <div className="text-white font-medium truncate leading-tight">
                        <span className="text-slate-500 text-[9px] mr-0.5">vs</span>
                        {sel.fixture?.away_team}
                      </div>
                      {sel.fixture?.home_score !== null &&
                        sel.fixture?.away_score !== null && (
                          <div className="text-amber-400 font-bold mt-0.5 text-[10px]">
                            {sel.fixture?.home_score}-{sel.fixture?.away_score}
                            {sel.total_goals !== null && (
                              <span className="text-slate-400 font-normal ml-0.5">({sel.total_goals}g)</span>
                            )}
                          </div>
                        )}
                    </div>
                    <div className="flex-shrink-0">{getResultBadge(sel.result)}</div>
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

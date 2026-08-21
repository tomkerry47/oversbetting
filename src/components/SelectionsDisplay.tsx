'use client';

import { MAX_SELECTIONS_PER_PLAYER, Selection, PLAYERS } from '@/types';
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
        return <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">Won</span>;
      case 'lost':
        return <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-300">Lost</span>;
      default:
        return <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">Pending</span>;
    }
  };

  const submittedPlayers = PLAYERS.filter((player) => grouped[player]?.length > 0);
  const waitingPlayers = PLAYERS.filter((player) => !grouped[player]?.length);
  const totalPicks = PLAYERS.length * MAX_SELECTIONS_PER_PLAYER;

  return (
    <section className="card overflow-hidden !p-0">
      <div className="flex items-center justify-between gap-3 border-b border-slate-700/80 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5h6M9 3h6a2 2 0 0 1 2 2v1h2v15H5V6h2V5a2 2 0 0 1 2-2Z" /><path d="M8 11h8M8 15h8" /></svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white sm:text-base">This Week&apos;s Picks</h3>
            <p className="mt-0.5 text-[10px] text-slate-400">{selections.length}/{totalPicks} selections locked in</p>
          </div>
        </div>
        <button onClick={handleCopy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700/60 px-2.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 active:scale-[.97]" aria-live="polite">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
        {submittedPlayers.map((player) => {
          const playerPicks = grouped[player];
          return (
            <div key={player} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/45">
              <div className="flex items-center justify-between border-b border-slate-700/70 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-xs font-black text-emerald-300">{player.charAt(0)}</span>
                  <h4 className="text-sm font-bold text-white">{player}</h4>
                </div>
                <span className="text-[10px] font-semibold text-emerald-400">{playerPicks.length}/{MAX_SELECTIONS_PER_PLAYER} picks</span>
              </div>
              <div className="divide-y divide-slate-700/60">
                {playerPicks.map((sel) => (
                  <div
                    key={sel.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3"
                  >
                    <div className="min-w-0 text-xs">
                      <div className="flex items-start gap-1.5 font-semibold leading-snug text-white">
                        {sel.fixture?.is_star_pick && <span className="shrink-0" title="Top pick">⭐</span>}
                        <span className="break-words">{sel.fixture?.home_team}</span>
                      </div>
                      <div className="mt-0.5 pl-0 font-medium leading-snug text-slate-200">
                        <span className="mr-1 text-[9px] uppercase text-slate-500">vs</span>
                        <span className="break-words">{sel.fixture?.away_team}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {getResultBadge(sel.result)}
                      {sel.fixture?.home_score != null && sel.fixture?.away_score != null && (
                          <div className="text-xs font-bold text-white">
                            {sel.fixture?.home_score}-{sel.fixture?.away_score}
                            {sel.total_goals !== null && (
                              <span className="ml-1 text-[9px] font-normal text-slate-400">{sel.total_goals}g</span>
                            )}
                          </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {waitingPlayers.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-slate-700/80 bg-slate-900/25 px-4 py-3">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Awaiting picks</span>
        {waitingPlayers.map((player) => <span key={player} className="rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[10px] font-semibold text-slate-400">{player}</span>)}
      </div>}
    </section>
  );
}

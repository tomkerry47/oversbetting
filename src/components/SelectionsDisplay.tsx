'use client';

import { MAX_SELECTIONS_PER_PLAYER, Selection, PLAYERS } from '@/types';
import { formatSelectionsForCopy } from '@/lib/utils';
import { FixtureDetails, FixtureInsights } from '@/components/FixtureSelector';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface SelectionsDisplayProps {
  selections: Selection[];
}

export default function SelectionsDisplay({ selections }: SelectionsDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [activeSelection, setActiveSelection] = useState<Selection | null>(null);
  const [details, setDetails] = useState<FixtureDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    if (!activeSelection) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveSelection(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [activeSelection]);

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

  const openAnalysis = async (selection: Selection) => {
    const fixture = selection.fixture;
    if (!fixture) return;

    setActiveSelection(selection);
    setDetails(null);
    setDetailsLoading(true);

    try {
      if (fixture.home_form && fixture.away_form) {
        const nextDetails: FixtureDetails = {
          homeForm: fixture.home_form,
          awayForm: fixture.away_form,
          odds: fixture.odds_over_25 || fixture.odds_under_25
            ? { over: fixture.odds_over_25 || 'N/A', under: fixture.odds_under_25 || 'N/A' }
            : null,
        };
        if (fixture.data_provider === 'bsd') {
          const response = await fetch(`/api/fixtures/bsd-insights?fixtureId=${fixture.id}`, { cache: 'no-store' });
          if (response.ok) Object.assign(nextDetails, await response.json());
        }
        setDetails(nextDetails);
        return;
      }

      if (fixture.home_team_id && fixture.away_team_id) {
        const response = await fetch(`/api/test/fixture-details?fixtureId=${fixture.api_fixture_id}&homeTeamId=${fixture.home_team_id}&awayTeamId=${fixture.away_team_id}&leagueId=${fixture.league_id}`);
        if (response.ok) setDetails(await response.json());
      }
    } catch (cause) {
      console.error('Match analysis unavailable:', cause);
    } finally {
      setDetailsLoading(false);
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
        {submittedPlayers.map((player, playerIndex) => {
          const playerPicks = grouped[player];
          const spansFullRow = submittedPlayers.length % 2 === 1 && playerIndex === submittedPlayers.length - 1;
          return (
            <div key={player} className={`overflow-hidden rounded-xl border border-slate-700 bg-slate-900/45 ${spansFullRow ? 'sm:col-span-2' : ''}`}>
              <div className="flex items-center justify-between border-b border-slate-700/70 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-xs font-black text-emerald-300">{player.charAt(0)}</span>
                  <h4 className="text-sm font-bold text-white">{player}</h4>
                </div>
                <span className="text-[10px] font-semibold text-emerald-400">{playerPicks.length}/{MAX_SELECTIONS_PER_PLAYER} picks</span>
              </div>
              <div className={`divide-y divide-slate-700/60 ${spansFullRow ? 'sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0' : ''}`}>
                {playerPicks.map((sel) => (
                  <button
                    key={sel.id}
                    type="button"
                    onClick={() => openAnalysis(sel)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-800/70 active:bg-slate-800"
                    aria-label={`View analysis for ${sel.fixture?.home_team} versus ${sel.fixture?.away_team}`}
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
                  </button>
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

      {activeSelection?.fixture && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/80 p-2 backdrop-blur-sm touch-pan-y sm:items-center sm:p-4"
          onClick={() => setActiveSelection(null)}
          role="presentation"
        >
          <section
            className="mt-[15dvh] max-h-[calc(85dvh-1rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl sm:mt-0 sm:max-h-[88dvh]"
            role="dialog"
            aria-modal="true"
            aria-label={`${activeSelection.fixture.home_team} versus ${activeSelection.fixture.away_team} analysis`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-700 bg-slate-900/95 p-4 backdrop-blur">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">{activeSelection.player_name}&apos;s pick</div>
                <h3 className="mt-1 text-base font-bold leading-snug text-white">
                  {activeSelection.fixture.home_team}{activeSelection.fixture.home_team_position ? ` (#${activeSelection.fixture.home_team_position})` : ''}
                  <span className="mx-1 text-slate-500">vs</span>
                  {activeSelection.fixture.away_team}{activeSelection.fixture.away_team_position ? ` (#${activeSelection.fixture.away_team_position})` : ''}
                </h3>
              </div>
              <button onClick={() => setActiveSelection(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xl text-slate-300" aria-label="Close match analysis">×</button>
            </header>
            <div className="p-4">
              {detailsLoading
                ? <div className="py-12 text-center text-sm text-slate-400">Loading predictions and form…</div>
                : details
                ? <FixtureInsights fixture={activeSelection.fixture} details={details} />
                : <div className="py-12 text-center text-sm text-slate-400">Match analysis is not available yet.</div>}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}

'use client';

import { useState } from 'react';
import { Fixture, PlayerName, PLAYERS, MAX_SELECTIONS_PER_PLAYER } from '@/types';

interface FixtureSelectorProps {
  fixtures: Fixture[];
  weekId: number;
  existingSelections: Record<string, number[]>;
  onSelectionSubmitted: () => void;
}

export default function FixtureSelector({
  fixtures,
  weekId,
  existingSelections,
  onSelectionSubmitted,
}: FixtureSelectorProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerName | null>(null);
  const [selectedFixtures, setSelectedFixtures] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const groupedFixtures = fixtures.reduce<Record<string, Fixture[]>>((acc, f) => {
    if (!acc[f.league_name]) acc[f.league_name] = [];
    acc[f.league_name].push(f);
    return acc;
  }, {});

  const handleFixtureToggle = (fixtureId: number) => {
    setSelectedFixtures((prev) => {
      if (prev.includes(fixtureId)) {
        return prev.filter((id) => id !== fixtureId);
      }
      if (prev.length >= MAX_SELECTIONS_PER_PLAYER) {
        return prev;
      }
      return [...prev, fixtureId];
    });
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedPlayer) {
      setError('Select a player first');
      return;
    }
    if (selectedFixtures.length !== MAX_SELECTIONS_PER_PLAYER) {
      setError(`Select exactly ${MAX_SELECTIONS_PER_PLAYER} fixtures`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: selectedPlayer,
          fixture_ids: selectedFixtures,
          week_id: weekId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit selections');
        return;
      }

      setSuccess(`${selectedPlayer}'s picks submitted! ✅`);
      setSelectedPlayer(null);
      setSelectedFixtures([]);
      onSelectionSubmitted();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Network error, please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const playerHasSelected = (player: PlayerName) => {
    return (existingSelections[player] || []).length > 0;
  };

  return (
    <div className="space-y-4">
      {/* Player Selection */}
      <div className="card">
        <h3 className="text-base font-semibold text-white mb-3">Who&apos;s picking?</h3>
        <div className="grid grid-cols-2 gap-2">
          {PLAYERS.map((player) => {
            const hasSelected = playerHasSelected(player);
            const isActive = selectedPlayer === player;

            return (
              <button
                key={player}
                onClick={() => {
                  setSelectedPlayer(player);
                  setSelectedFixtures([]);
                  setError(null);
                }}
                className={`py-4 px-3 rounded-xl border-2 transition-all font-semibold text-center active:scale-[0.97] ${
                  isActive
                    ? 'border-emerald-500 bg-emerald-900/40 text-emerald-400'
                    : hasSelected
                    ? 'border-slate-600 bg-slate-700/50 text-slate-300'
                    : 'border-slate-600 bg-slate-800 text-white'
                }`}
              >
                <div className="text-base">{player}</div>
                {hasSelected && (
                  <div className="text-xs text-emerald-400 mt-1">✅ Picked</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fixture Selection */}
      {selectedPlayer && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-white">
              {selectedPlayer}&apos;s Picks
              <span className="text-xs text-slate-400 ml-1">
                ({selectedFixtures.length}/{MAX_SELECTIONS_PER_PLAYER})
              </span>
            </h3>
            {playerHasSelected(selectedPlayer) && (
              <span className="text-[10px] text-amber-400">
                ⚠️ Replaces picks
              </span>
            )}
          </div>

          {Object.entries(groupedFixtures).map(([league, leagueFixtures]) => (
            <div key={league} className="mb-3">
              <h4 className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                {league}
              </h4>
              <div className="space-y-1.5">
                {leagueFixtures.map((fixture) => {
                  const isSelected = selectedFixtures.includes(fixture.id);
                  const isFull =
                    selectedFixtures.length >= MAX_SELECTIONS_PER_PLAYER &&
                    !isSelected;

                  return (
                    <button
                      key={fixture.id}
                      onClick={() => handleFixtureToggle(fixture.id)}
                      disabled={isFull}
                      className={`w-full text-left p-3 rounded-xl border transition-all
                        fixture-selectable
                        ${
                          isSelected
                            ? 'fixture-selected border-emerald-500'
                            : isFull
                            ? 'border-slate-700 bg-slate-800/50 opacity-40 cursor-not-allowed'
                            : 'border-slate-700 bg-slate-800/50'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center text-xs
                            ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-slate-500'
                            }`}
                        >
                          {isSelected && '✓'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {fixture.home_team}
                          </div>
                          <div className="text-sm font-medium text-white truncate">
                            <span className="text-slate-500 text-xs mr-1">vs</span>
                            {fixture.away_team}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {fixtures.length === 0 && (
            <p className="text-slate-400 text-center py-8">
              No 15:00 fixtures found for this Saturday. Try refreshing.
            </p>
          )}
        </div>
      )}

      {/* Submit */}
      {selectedPlayer && selectedFixtures.length > 0 && (
        <div className="card">
          <p className="text-white font-medium text-sm text-center mb-1">
            {selectedFixtures.length}/{MAX_SELECTIONS_PER_PLAYER} selected
            {selectedFixtures.length === MAX_SELECTIONS_PER_PLAYER
              ? ' — Ready! ✅'
              : ` — Pick ${MAX_SELECTIONS_PER_PLAYER - selectedFixtures.length} more`}
          </p>
          <button
            onClick={handleSubmit}
            disabled={
              submitting ||
              selectedFixtures.length !== MAX_SELECTIONS_PER_PLAYER
            }
            className="btn-primary w-full text-base py-4"
          >
            {submitting ? 'Submitting...' : `Submit ${selectedPlayer}'s Picks`}
          </button>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-sm">
          {success}
        </div>
      )}
    </div>
  );
}

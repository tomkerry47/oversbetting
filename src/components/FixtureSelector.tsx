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
    <div className="space-y-6">
      {/* Player Selection */}
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-3">Who's picking?</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                className={`p-3 rounded-lg border-2 transition-all font-semibold text-center ${
                  isActive
                    ? 'border-emerald-500 bg-emerald-900/40 text-emerald-400'
                    : hasSelected
                    ? 'border-slate-600 bg-slate-700/50 text-slate-300'
                    : 'border-slate-600 bg-slate-800 text-white hover:border-emerald-500/50'
                }`}
              >
                <div>{player}</div>
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              {selectedPlayer}&apos;s Picks
              <span className="text-sm text-slate-400 ml-2">
                ({selectedFixtures.length}/{MAX_SELECTIONS_PER_PLAYER})
              </span>
            </h3>
            {playerHasSelected(selectedPlayer) && (
              <span className="text-xs text-amber-400">
                ⚠️ Will replace existing picks
              </span>
            )}
          </div>

          {Object.entries(groupedFixtures).map(([league, leagueFixtures]) => (
            <div key={league} className="mb-4">
              <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                {league}
              </h4>
              <div className="space-y-2">
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
                      className={`w-full text-left p-3 rounded-lg border transition-all
                        fixture-selectable
                        ${
                          isSelected
                            ? 'fixture-selected border-emerald-500'
                            : isFull
                            ? 'border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed'
                            : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs
                            ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-slate-500'
                            }`}
                          >
                            {isSelected && '✓'}
                          </div>
                          <div>
                            <span className="font-medium text-white">
                              {fixture.home_team}
                            </span>
                            <span className="text-slate-400 mx-2">vs</span>
                            <span className="font-medium text-white">
                              {fixture.away_team}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs text-slate-500">15:00</span>
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">
                {selectedFixtures.length}/{MAX_SELECTIONS_PER_PLAYER} fixtures selected
              </p>
              <p className="text-slate-400 text-sm">
                {selectedFixtures.length === MAX_SELECTIONS_PER_PLAYER
                  ? 'Ready to submit!'
                  : `Pick ${MAX_SELECTIONS_PER_PLAYER - selectedFixtures.length} more`}
              </p>
            </div>
            <button
              onClick={handleSubmit}
              disabled={
                submitting ||
                selectedFixtures.length !== MAX_SELECTIONS_PER_PLAYER
              }
              className="btn-primary"
            >
              {submitting ? 'Submitting...' : `Submit ${selectedPlayer}'s Picks`}
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-lg">
          {success}
        </div>
      )}
    </div>
  );
}

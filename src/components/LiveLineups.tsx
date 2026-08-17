'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function PlayerAvatar({ player }: { player: any }) {
  const [failed, setFailed] = useState(false);
  return <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-600 bg-slate-700">
    <div className="absolute inset-0 grid place-items-center text-[10px] font-bold text-slate-300">{initials(player.short_name || player.name || '?')}</div>
    {!failed && <Image unoptimized fill sizes="36px" className="object-cover" src={`https://sports.bzzoiro.com/img/player/${player.id}/?sor=true&bg=transparent`} alt={player.name || 'Player'} onError={() => setFailed(true)} />}
  </div>;
}

function PlayerRow({ player }: { player: any }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-900/45 p-2">
    <PlayerAvatar player={player} />
    <div className="min-w-0">
      <div className="truncate text-xs font-semibold text-white"><span className="mr-1 text-slate-500">{player.jersey_number ?? '–'}</span>{player.short_name || player.name}{player.captain ? <span className="ml-1 text-[9px] text-amber-300">(C)</span> : null}</div>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{player.position || 'Player'}</div>
    </div>
  </div>;
}

function TeamLineup({ team }: { team: any }) {
  return <div className="min-w-0">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="truncate text-xs font-bold text-white">{team.team_name}</h3>
      {team.formation && <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[9px] text-slate-300">{team.formation}</span>}
    </div>
    <div className="space-y-1.5">{(team.players || []).map((player: any) => <PlayerRow key={player.id} player={player} />)}</div>
    {(team.substitutes || []).length > 0 && <details className="mt-3">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Bench ({team.substitutes.length})</summary>
      <div className="mt-2 space-y-1.5">{team.substitutes.map((player: any) => <PlayerRow key={player.id} player={player} />)}</div>
    </details>}
  </div>;
}

export default function LiveLineups({ endpoint }: { endpoint: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(endpoint, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Lineups unavailable');
      if (active) { setData(body); setError(''); }
    }).catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  if (loading) return <section className="card text-center text-xs text-slate-500">Loading lineups…</section>;
  if (error) return <section className="card text-center text-xs text-slate-500">{error}</section>;
  if (!data?.lineups) return <section className="card text-center text-xs text-slate-500">Lineups have not been announced.</section>;
  const predicted = data.lineup_status === 'predicted';
  return <section className="card">
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-white">Lineups</h2>
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${predicted ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{predicted ? 'Predicted' : 'Confirmed'}</span>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:gap-5">
      <TeamLineup team={data.lineups.home} />
      <TeamLineup team={data.lineups.away} />
    </div>
  </section>;
}

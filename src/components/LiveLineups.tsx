'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function normalizedName(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesPlayer(player: any, name: unknown, id: unknown) {
  if (id !== null && id !== undefined && String(player.id) === String(id)) return true;
  const target = normalizedName(name);
  return Boolean(target) && [player.name, player.short_name].some((value) => normalizedName(value) === target);
}

function eventMinute(event: any) {
  if (event.minute === null || event.minute === undefined) return '';
  return `${event.minute}${event.addedTime ? `+${event.addedTime}` : ''}′`;
}

function PlayerMarkers({ player, events }: { player: any; events: any[] }) {
  const markers = events.flatMap((event) => {
    const minute = eventMinute(event);
    const result: { key: string; label: string; title: string; className: string }[] = [];
    if (event.type === 'goal' && matchesPlayer(player, event.player, event.playerId)) {
      result.push({ key: `${event.id}-goal`, label: `⚽ ${minute}`, title: `Goal ${minute}`, className: 'bg-emerald-500/15 text-emerald-300' });
    }
    if (event.type === 'goal' && matchesPlayer(player, event.assist, event.assistId)) {
      result.push({ key: `${event.id}-assist`, label: `A ${minute}`, title: `Assist ${minute}`, className: 'bg-sky-500/15 text-sky-300' });
    }
    if ((event.type === 'yellow-card' || event.type === 'red-card') && matchesPlayer(player, event.player, event.playerId)) {
      const red = event.type === 'red-card';
      result.push({ key: `${event.id}-card`, label: `${red ? '🟥' : '🟨'} ${minute}`, title: `${red ? 'Red' : 'Yellow'} card ${minute}`, className: red ? 'bg-red-500/15 text-red-200' : 'bg-amber-500/15 text-amber-200' });
    }
    if (event.type === 'substitution' && matchesPlayer(player, event.player, event.playerId)) {
      result.push({ key: `${event.id}-on`, label: `↑ ${minute}`, title: `Substituted on ${minute}`, className: 'bg-emerald-500/15 text-emerald-300' });
    }
    if (event.type === 'substitution' && matchesPlayer(player, event.playerOut, event.playerOutId)) {
      result.push({ key: `${event.id}-off`, label: `↓ ${minute}`, title: `Substituted off ${minute}`, className: 'bg-slate-700 text-slate-300' });
    }
    return result;
  });
  if (!markers.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1">{markers.map((marker) => <span key={marker.key} title={marker.title} className={`rounded px-1 py-0.5 text-[9px] font-bold leading-none ${marker.className}`}>{marker.label}</span>)}</div>;
}

function PlayerAvatar({ player }: { player: any }) {
  const [failed, setFailed] = useState(false);
  return <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-600 bg-slate-700">
    <div className="absolute inset-0 grid place-items-center text-[10px] font-bold text-slate-300">{initials(player.short_name || player.name || '?')}</div>
    {!failed && <Image unoptimized fill sizes="36px" className="object-cover" src={`https://sports.bzzoiro.com/img/player/${player.id}/?sor=true&bg=transparent`} alt={player.name || 'Player'} onError={() => setFailed(true)} />}
  </div>;
}

function PlayerRow({ player, events }: { player: any; events: any[] }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-900/45 p-2">
    <PlayerAvatar player={player} />
    <div className="min-w-0">
      <div className="truncate text-xs font-semibold text-white"><span className="mr-1 text-slate-500">{player.jersey_number ?? '–'}</span>{player.short_name || player.name}{player.captain ? <span className="ml-1 text-[9px] text-amber-300">(C)</span> : null}</div>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{player.position || 'Player'}</div>
      <PlayerMarkers player={player} events={events} />
    </div>
  </div>;
}

function TeamLineup({ team, events }: { team: any; events: any[] }) {
  const substitutes = (team.substitutes || []).filter((player: any) =>
    events.some((event) => event.type === 'substitution' && matchesPlayer(player, event.player, event.playerId))
  );
  return <div className="min-w-0">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="truncate text-xs font-bold text-white">{team.team_name}</h3>
      {team.formation && <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[9px] text-slate-300">{team.formation}</span>}
    </div>
    <div className="space-y-1.5">{(team.players || []).map((player: any) => <PlayerRow key={player.id} player={player} events={events} />)}</div>
    {substitutes.length > 0 && <div className="mt-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Used substitutes ({substitutes.length})</div>
      <div className="mt-2 space-y-1.5">{substitutes.map((player: any) => <PlayerRow key={player.id} player={player} events={events} />)}</div>
    </div>}
  </div>;
}

export default function LiveLineups({ endpoint, events = [] }: { endpoint: string; events?: any[] }) {
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
    <div className="mb-3 text-[9px] text-slate-500">⚽ Goal · <span className="text-sky-300">A</span> Assist · 🟨/🟥 Card · <span className="text-emerald-300">↑</span>/<span className="text-slate-300">↓</span> Substitution</div>
    <div className="grid grid-cols-2 gap-3 sm:gap-5">
      <TeamLineup team={data.lineups.home} events={events.filter((event) => event.team === 'home')} />
      <TeamLineup team={data.lineups.away} events={events.filter((event) => event.team === 'away')} />
    </div>
  </section>;
}

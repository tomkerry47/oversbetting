'use client';

function minuteLabel(event: any) {
  if (event.minute == null) return '–';
  return `${event.minute}${event.addedTime ? `+${event.addedTime}` : ''}′`;
}

function icon(type: string) {
  if (type === 'goal') return '⚽';
  if (type === 'red-card') return '🟥';
  if (type === 'yellow-card') return '🟨';
  return 'VAR';
}

function TeamEvents({ events, align, onReplay }: { events: any[]; align: 'left' | 'right'; onReplay?: (event: any) => void }) {
  return <div className={`space-y-1 ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {events.map((event) => <div key={event.id} className="text-[11px] leading-tight text-slate-300">
      {event.type === 'goal' && onReplay
        ? <button onClick={() => onReplay({ ...event, replayNonce: Date.now() })} className="font-semibold text-white underline decoration-emerald-500/70 decoration-dotted underline-offset-2 hover:text-emerald-300" title="Watch goal replay">{event.player || 'Goal scorer'}</button>
        : <span className="font-semibold text-white">{event.player || 'Match update'}</span>}{' '}
      <span>{icon(event.type)} {minuteLabel(event)}</span>
      {event.assist && <div className="text-[9px] text-slate-500">Assist: {event.assist}</div>}
    </div>)}
  </div>;
}

export default function LiveKeyEvents({ events = [], onReplay }: { events?: any[]; onReplay?: (event: any) => void }) {
  const visible = events.filter((event) => ['goal', 'yellow-card', 'red-card', 'var'].includes(event.type));
  if (visible.length === 0) return null;
  const home = visible.filter((event) => event.team === 'home');
  const away = visible.filter((event) => event.team === 'away');
  return <div className="mt-3 grid grid-cols-[1fr_3rem_1fr] gap-2 border-t border-slate-700/80 pt-3">
    <TeamEvents events={home} align="right" onReplay={onReplay} />
    <div className="text-center text-[9px] uppercase tracking-widest text-slate-500">Events</div>
    <TeamEvents events={away} align="left" onReplay={onReplay} />
  </div>;
}

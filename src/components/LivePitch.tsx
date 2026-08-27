'use client';

import { useEffect, useRef, useState } from 'react';

type LivePitchProps = {
  detail: any;
  streamUrl?: string;
  onMatchEvent?: (event: any) => void;
  eventId?: number | string | null;
  websocketPlus?: boolean;
  matchStatus?: string | null;
  homeTeam?: string;
  awayTeam?: string;
};

export default function LivePitch({
  detail,
  streamUrl,
  onMatchEvent,
  eventId,
  websocketPlus = false,
  matchStatus,
  homeTeam = 'Home',
  awayTeam = 'Away',
}: LivePitchProps) {
  const [connected, setConnected] = useState(false);
  const [feedSource, setFeedSource] = useState<string | null>(null);
  const [feedError, setFeedError] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const arenaKey = process.env.NEXT_PUBLIC_ARENA_EMBED_KEY;
  const arenaAvailable = Boolean(arenaKey && eventId && websocketPlus);
  const eventCallback = useRef(onMatchEvent);
  eventCallback.current = onMatchEvent;

  useEffect(() => {
    if (!streamUrl) return;

    setConnected(false);
    setFeedSource(null);
    setFeedError('');
    const source = new EventSource(streamUrl);
    source.onopen = () => {
      setConnected(true);
      setFeedError('');
    };
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'error') {
          setFeedError(message.message || message.code || 'Live feed unavailable');
          setConnected(false);
          source.close();
          return;
        }
        if (message.type === 'snapshot') {
          setFeedSource(message.source || null);
          if (message.event) eventCallback.current?.(message.event);
        } else {
          eventCallback.current?.(message);
        }
      } catch {
        // Keep the last good match state when a malformed live frame arrives.
      }
    };

    return () => source.close();
  }, [streamUrl]);

  if (!arenaAvailable) return null;

  const arenaStatus = String(matchStatus || detail?.status || '').toLowerCase().replaceAll('_', '');
  const arenaMode = ['inprogress', 'live', '1sthalf', '2ndhalf', 'halftime', 'paused', 'extratime'].includes(arenaStatus) ? 'live' : 'replay';
  const arenaUrl = `https://arena.bzzoiro.com/embed/${arenaMode}/${eventId}/?key=${encodeURIComponent(arenaKey!)}&off=scoreboard%2Cads%2Cpressure&dim=3&quality=high&cam=fixed`;
  const connectionLabel = feedError
    ? 'Feed error'
    : feedSource === 'full'
      ? 'WS+ live'
      : feedSource === 'basic'
        ? 'Basic live'
        : connected
          ? 'Live connection'
          : 'Connecting';

  return (
    <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/80 shadow-lg">
      <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
        <div>
          <h2 className="text-sm font-bold text-white">Arena3D</h2>
          <div className="text-[9px] uppercase tracking-wider text-emerald-400">WS+ {arenaMode} · high quality</div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`hidden items-center gap-1.5 text-[10px] uppercase tracking-wider sm:flex ${feedError ? 'text-red-300' : connected ? 'text-emerald-300' : 'text-slate-500'}`}>
            <i className={`h-2 w-2 rounded-full ${feedError ? 'bg-red-400' : connected ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />
            {connectionLabel}
          </span>
          <button
            type="button"
            onClick={() => setIsCollapsed((current) => !current)}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-slate-700/60 hover:text-slate-200"
            aria-controls="arena-3d-viewer"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand Arena3D' : 'Collapse Arena3D'}
            title={isCollapsed ? 'Expand Arena3D' : 'Collapse Arena3D'}
          >
            <span aria-hidden="true" className={`text-sm leading-none transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>⌄</span>
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <div id="arena-3d-viewer" className="relative aspect-[3/4] overflow-hidden border-t border-slate-700 bg-slate-950 sm:aspect-square md:aspect-[4/3] xl:aspect-[16/10]">
          <iframe
            src={arenaUrl}
            title={`Arena3D ${homeTeam} vs ${awayTeam}`}
            className="absolute inset-0 h-full w-full border-0"
            allow="fullscreen"
            allowFullScreen
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
    </section>
  );
}

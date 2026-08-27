'use client';

import { useEffect, useState } from 'react';

type LiveMatchClockProps = {
  live?: any;
  fallbackStatus?: string | null;
  className?: string;
};

function normalizedStatus(value: unknown) {
  return String(value || '').toLowerCase().replaceAll('_', '').replaceAll(' ', '');
}

export default function LiveMatchClock({ live, fallbackStatus, className = '' }: LiveMatchClockProps) {
  const [now, setNow] = useState(() => Date.now());
  const status = normalizedStatus(live?.status || fallbackStatus);
  const minute = live?.minute === null || live?.minute === undefined ? Number.NaN : Number(live.minute);
  const second = live?.second === null || live?.second === undefined ? Number.NaN : Number(live.second);
  const hasMinute = Number.isFinite(minute);
  const hasSecond = Number.isFinite(second);
  const anchor = live?.clockUpdatedAt === null || live?.clockUpdatedAt === undefined ? Number.NaN : Number(live.clockUpdatedAt);
  const isRunning = ['live', 'inprogress', '1sthalf', '2ndhalf', 'firsthalf', 'secondhalf', 'extratime'].includes(status);

  useEffect(() => {
    setNow(Date.now());
    if (!isRunning || !hasMinute) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [anchor, hasMinute, isRunning, minute, second]);

  let label: string | null = null;
  if (['finished', 'ft', 'ended'].includes(status)) label = 'FT';
  else if (['halftime', 'ht'].includes(status)) label = 'HT';
  else if (status === 'paused') label = 'PAUSED';
  else if (status === 'penalties') label = 'PENS';
  else if (['notstarted', 'ns'].includes(status)) label = 'NS';
  else if (['postponed', 'pst'].includes(status)) label = 'PST';
  else if (hasMinute) {
    const elapsed = isRunning && Number.isFinite(anchor) ? Math.max(0, Math.floor((now - anchor) / 1_000)) : 0;
    const totalSeconds = Math.max(0, (minute * 60) + (hasSecond ? second : 0) + elapsed);
    label = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  } else if (isRunning) label = 'LIVE';

  if (!label) return null;
  return <span className={`tabular-nums ${className}`}>{label}</span>;
}

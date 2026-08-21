'use client';

function StatRow({ label, home, away, suffix = '' }: { label: string; home: number | null; away: number | null; suffix?: string }) {
  if (home == null && away == null) return null;
  return <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
    <span className="font-bold text-white">{home ?? '–'}{home != null ? suffix : ''}</span>
    <span className="text-xs text-slate-400">{label}</span>
    <span className="text-right font-bold text-white">{away ?? '–'}{away != null ? suffix : ''}</span>
  </div>;
}

export default function LiveStats({ stats }: { stats: any }) {
  const hasStats = Boolean(stats && [
    stats.homeShotsOnTarget, stats.awayShotsOnTarget,
    stats.shotsOnTarget?.home, stats.shotsOnTarget?.away,
    stats.homeShots, stats.awayShots, stats.shots?.home, stats.shots?.away,
    stats.homeBigChances, stats.awayBigChances,
    stats.homeHitWoodwork, stats.awayHitWoodwork,
    stats.homeXg, stats.awayXg, stats.xg?.home, stats.xg?.away,
    stats.homePossession, stats.awayPossession,
    stats.possession?.home, stats.possession?.away,
    stats.homeCorners, stats.awayCorners, stats.corners?.home, stats.corners?.away,
  ].some((value) => value !== null && value !== undefined));

  return <section className="card !p-2 sm:!p-3">
    <h2 className="mb-3 text-sm font-bold text-white">Match statistics</h2>
    {!hasStats ? <p className="py-4 text-center text-sm text-slate-400">Stats will appear once the match starts.</p> : <div className="space-y-2.5">
      <StatRow label="Shots on target" home={stats.homeShotsOnTarget ?? stats.shotsOnTarget?.home} away={stats.awayShotsOnTarget ?? stats.shotsOnTarget?.away} />
      <StatRow label="Total shots" home={stats.homeShots ?? stats.shots?.home} away={stats.awayShots ?? stats.shots?.away} />
      <StatRow label="Big chances" home={stats.homeBigChances} away={stats.awayBigChances} />
      <StatRow label="Hit woodwork" home={stats.homeHitWoodwork} away={stats.awayHitWoodwork} />
      <StatRow label={stats.xgEstimated ? 'xG (estimated)' : 'xG'} home={stats.homeXg ?? stats.xg?.home} away={stats.awayXg ?? stats.xg?.away} />
      <StatRow label="Possession" home={stats.homePossession ?? stats.possession?.home} away={stats.awayPossession ?? stats.possession?.away} suffix="%" />
      <StatRow label="Pass accuracy" home={stats.homePassAccuracy} away={stats.awayPassAccuracy} suffix="%" />
      <StatRow label="Corners" home={stats.homeCorners ?? stats.corners?.home} away={stats.awayCorners ?? stats.corners?.away} />
      <StatRow label="Fouls" home={stats.homeFouls} away={stats.awayFouls} />
    </div>}
  </section>;
}

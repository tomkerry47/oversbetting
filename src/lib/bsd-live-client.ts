function numberValue(value: any): number | null {
  if (value && typeof value === 'object') value = value.actual;
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}

export function mergeBsdLiveEvent(current: any, payload: any) {
  const event = payload?.event || payload?.data || payload || {};
  const stats = event.stats || {};
  const home = stats.home || stats.home_team || {};
  const away = stats.away || stats.away_team || {};
  const choose = (next: any, previous: any) => next !== null && next !== undefined ? next : previous;
  const minute = numberValue(event.current_minute ?? event.time?.minute ?? event.minute);
  const second = numberValue(event.current_second ?? event.time?.second ?? event.second);
  const hasClock = minute !== null || second !== null;
  const sameWholeMinute = minute !== null && minute === numberValue(current?.minute) && second === null;
  return {
    ...(current || {}),
    liveWebsocket: choose(event.live_websocket, current?.liveWebsocket),
    websocketPlus: choose(event.websocket_plus, current?.websocketPlus),
    homeScore: choose(numberValue(event.homeScore ?? event.score?.home ?? event.home_score), current?.homeScore),
    awayScore: choose(numberValue(event.awayScore ?? event.score?.away ?? event.away_score), current?.awayScore),
    minute: choose(minute, current?.minute),
    second: choose(second, current?.second),
    clockDisplay: choose(event.time?.display ?? event.clock?.display, current?.clockDisplay),
    period: choose(numberValue(event.time?.period ?? event.period), current?.period),
    injuryTime: choose(numberValue(event.time?.injury_time ?? event.injury_time), current?.injuryTime),
    clockUpdatedAt: hasClock && !sameWholeMinute ? Date.now() : current?.clockUpdatedAt,
    status: event.time?.status || event.status || current?.status,
    homeShotsOnTarget: choose(numberValue(home.shots_on_target), current?.homeShotsOnTarget),
    awayShotsOnTarget: choose(numberValue(away.shots_on_target), current?.awayShotsOnTarget),
    homeShots: choose(numberValue(home.shots_total ?? home.total_shots), current?.homeShots),
    awayShots: choose(numberValue(away.shots_total ?? away.total_shots), current?.awayShots),
    homeBigChances: choose(numberValue(home.big_chances), current?.homeBigChances),
    awayBigChances: choose(numberValue(away.big_chances), current?.awayBigChances),
    homeXg: choose(numberValue(home.xg ?? home.expected_goals), current?.homeXg),
    awayXg: choose(numberValue(away.xg ?? away.expected_goals), current?.awayXg),
    homePossession: choose(numberValue(home.possession ?? home.ball_possession), current?.homePossession),
    awayPossession: choose(numberValue(away.possession ?? away.ball_possession), current?.awayPossession),
    homeCorners: choose(numberValue(home.corners ?? home.corner_kicks), current?.homeCorners),
    awayCorners: choose(numberValue(away.corners ?? away.corner_kicks), current?.awayCorners),
    homePassAccuracy: choose(numberValue(home.pass_accuracy_pct), current?.homePassAccuracy),
    awayPassAccuracy: choose(numberValue(away.pass_accuracy_pct), current?.awayPassAccuracy),
    homeFouls: choose(numberValue(home.fouls), current?.homeFouls),
    awayFouls: choose(numberValue(away.fouls), current?.awayFouls),
    homeHitWoodwork: choose(numberValue(home.hit_woodwork), current?.homeHitWoodwork),
    awayHitWoodwork: choose(numberValue(away.hit_woodwork), current?.awayHitWoodwork),
  };
}

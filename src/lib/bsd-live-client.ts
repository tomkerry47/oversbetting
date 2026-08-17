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
  return {
    ...(current || {}),
    homeScore: choose(numberValue(event.score?.home ?? event.home_score), current?.homeScore),
    awayScore: choose(numberValue(event.score?.away ?? event.away_score), current?.awayScore),
    minute: choose(numberValue(event.time?.minute ?? event.minute), current?.minute),
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
  };
}

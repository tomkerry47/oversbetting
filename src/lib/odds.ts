export const DEFAULT_BET_STAKE = 5;

type SelectionWithOverOdds = {
  result?: 'pending' | 'won' | 'lost' | string | null;
  fixture?: {
    odds_over_25?: unknown;
  } | Array<{
    odds_over_25?: unknown;
  }> | null;
};

function selectionOdds(selection: SelectionWithOverOdds): number | null {
  const fixture = Array.isArray(selection.fixture)
    ? selection.fixture[0]
    : selection.fixture;
  return toDecimalOdds(fixture?.odds_over_25);
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

/** Convert decimal or fractional odds into decimal odds. */
export function toDecimalOdds(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw || raw.toUpperCase() === 'N/A') return null;

  if (raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length !== 2) return null;

    const numerator = Number(parts[0]);
    const denominator = Number(parts[1]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }

    const decimalOdds = 1 + numerator / denominator;
    return decimalOdds > 1 ? decimalOdds : null;
  }

  const decimalOdds = Number(raw);
  return Number.isFinite(decimalOdds) && decimalOdds > 1 ? decimalOdds : null;
}

/** Average the available over-2.5 prices, excluding fixtures without valid odds. */
export function calculateAverageOver25Odds(selections: SelectionWithOverOdds[]) {
  const odds = selections
    .map(selectionOdds)
    .filter((value): value is number => value !== null);

  return {
    averageOdds: odds.length > 0
      ? Number((odds.reduce((total, value) => total + value, 0) / odds.length).toFixed(2))
      : null,
    oddsCount: odds.length,
  };
}

export function calculateStakeReturn(decimalOdds: number | null, stake = DEFAULT_BET_STAKE) {
  return decimalOdds === null ? null : roundCurrency(decimalOdds * stake);
}

/** Settled singles profit/loss at a fixed stake; pending and unpriced picks are excluded. */
export function calculateProfitLoss(selections: SelectionWithOverOdds[], stake = DEFAULT_BET_STAKE) {
  let settledBets = 0;
  let totalReturn = 0;

  for (const selection of selections) {
    const odds = selectionOdds(selection);
    if (odds === null || (selection.result !== 'won' && selection.result !== 'lost')) continue;

    settledBets += 1;
    if (selection.result === 'won') totalReturn += odds * stake;
  }

  const totalStaked = settledBets * stake;
  return {
    settledBets,
    totalStaked: roundCurrency(totalStaked),
    totalReturn: roundCurrency(totalReturn),
    profitLoss: roundCurrency(totalReturn - totalStaked),
  };
}

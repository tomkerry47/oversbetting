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

/** Treat every selection as one leg of a single group accumulator. */
export function calculateGroupBet(selections: SelectionWithOverOdds[], stake = DEFAULT_BET_STAKE) {
  const odds = selections.map(selectionOdds);
  const hasAllOdds = selections.length > 0 && odds.every((value): value is number => value !== null);
  const combinedOdds = hasAllOdds
    ? odds.reduce((total, value) => total * value, 1)
    : null;
  const potentialReturn = combinedOdds === null ? null : roundCurrency(combinedOdds * stake);
  const hasLost = selections.some((selection) => selection.result === 'lost');
  const hasAllWon = selections.length > 0 && selections.every((selection) => selection.result === 'won');
  const settled = hasLost || (hasAllWon && potentialReturn !== null);
  const totalStaked = settled ? stake : 0;
  const totalReturn = hasAllWon && potentialReturn !== null ? potentialReturn : 0;

  return {
    combinedOdds: combinedOdds === null ? null : Number(combinedOdds.toFixed(2)),
    potentialReturn,
    settled,
    unpricedWinner: hasAllWon && potentialReturn === null,
    totalStaked: roundCurrency(totalStaked),
    totalReturn: roundCurrency(totalReturn),
    profitLoss: roundCurrency(totalReturn - totalStaked),
  };
}

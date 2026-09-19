type SelectionWithOverOdds = {
  fixture?: {
    odds_over_25?: unknown;
  } | Array<{
    odds_over_25?: unknown;
  }> | null;
};

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
    .map((selection) => {
      const fixture = Array.isArray(selection.fixture)
        ? selection.fixture[0]
        : selection.fixture;
      return toDecimalOdds(fixture?.odds_over_25);
    })
    .filter((value): value is number => value !== null);

  return {
    averageOdds: odds.length > 0
      ? Number((odds.reduce((total, value) => total + value, 0) / odds.length).toFixed(2))
      : null,
    oddsCount: odds.length,
  };
}

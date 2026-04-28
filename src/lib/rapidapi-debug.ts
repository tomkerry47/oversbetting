const SOFASCORE_RAPIDAPI_HOST = 'sofascore.p.rapidapi.com';
const SOFASCORE_RAPIDAPI_BASE = `https://${SOFASCORE_RAPIDAPI_HOST}`;

type RapidApiTournament = {
  id: number;
  name: string;
  slug?: string;
};

type RapidApiGroup = {
  name: string;
  tournaments: RapidApiTournament[];
};

async function sofascoreRapidApiFetch(
  endpoint: string,
  apiKey: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `${SOFASCORE_RAPIDAPI_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': SOFASCORE_RAPIDAPI_HOST,
      'x-rapidapi-key': apiKey,
    },
    cache: 'no-store',
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

export async function fetchRapidApiDebugFixtures(categoryId?: number) {
  const apiKey = process.env.RAPIDAPI_KEY;

  // Default to category 1 (Football / Soccer).
  const targetCategoryId =
    Number.isInteger(categoryId) && (categoryId as number) > 0 ? (categoryId as number) : 1;

  if (!apiKey) {
    return {
      ok: false,
      source: 'sofascore-rapidapi',
      categoryId: targetCategoryId,
      error: 'RAPIDAPI_KEY environment variable is not set',
    };
  }

  const endpoint = `/tournaments/list?categoryId=${targetCategoryId}`;

  try {
    const result = await sofascoreRapidApiFetch(endpoint, apiKey);

    if (!result.ok) {
      return {
        ok: false,
        source: 'sofascore-rapidapi',
        categoryId: targetCategoryId,
        status: result.status,
        error: `SofaScore RapidAPI responded with status ${result.status}: ${result.text.slice(0, 200)}`,
      };
    }

    const data = JSON.parse(result.text);
    const rawGroups: any[] = Array.isArray(data.groups) ? data.groups : [];

    const groups: RapidApiGroup[] = rawGroups.map((g: any) => ({
      name: g.name || 'Unknown',
      tournaments: (Array.isArray(g.uniqueTournaments) ? g.uniqueTournaments : []).map(
        (t: any): RapidApiTournament => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
        }),
      ),
    }));

    const totalTournaments = groups.reduce((sum, g) => sum + g.tournaments.length, 0);

    return {
      ok: true,
      source: 'sofascore-rapidapi',
      categoryId: targetCategoryId,
      endpoint,
      totalGroups: groups.length,
      totalTournaments,
      groups,
      raw: data,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      source: 'sofascore-rapidapi',
      categoryId: targetCategoryId,
      error: `Request failed: ${message}`,
    };
  }
}

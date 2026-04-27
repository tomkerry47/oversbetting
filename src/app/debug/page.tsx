'use client';

import { useMemo, useState } from 'react';

type DebugResult = {
  ok?: boolean;
  source?: string;
  date?: string;
  successfulHost?: string;
  totalEvents?: number;
  fixtures?: Array<{
    id: number;
    homeTeam: string;
    awayTeam: string;
    league: string;
    ukTime: string | null;
    status: string | null;
  }>;
  attempts?: Array<{
    host: string;
    status?: number;
    ok: boolean;
    error?: string;
    snippet?: string;
  }>;
  error?: string;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function ResultPanel({ title, result }: { title: string; result: DebugResult | null }) {
  if (!result) return null;

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-400">
            {result.source || 'unknown source'} · {result.date || 'unknown date'}
          </p>
        </div>
        <span className={result.ok ? 'badge-won' : 'badge-lost'}>
          {result.ok ? 'OK' : 'Failed'}
        </span>
      </div>

      {result.error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-200">
          {result.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-slate-900/60 p-3">
          <p className="text-slate-400">Events</p>
          <p className="text-xl font-bold text-white">{result.totalEvents ?? 0}</p>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-3">
          <p className="text-slate-400">Host</p>
          <p className="truncate text-sm font-semibold text-emerald-300">
            {result.successfulHost || 'none'}
          </p>
        </div>
      </div>

      {result.attempts && result.attempts.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">Attempts</h3>
          <div className="space-y-2">
            {result.attempts.map((attempt) => (
              <div key={attempt.host} className="rounded-lg bg-slate-900/60 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-200">{attempt.host}</span>
                  <span className={attempt.ok ? 'text-emerald-400' : 'text-red-400'}>
                    {attempt.status || 'ERR'}
                  </span>
                </div>
                {(attempt.error || attempt.snippet) && (
                  <p className="mt-1 line-clamp-2 text-slate-500">
                    {attempt.error || attempt.snippet}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.fixtures && result.fixtures.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            First fixtures
          </h3>
          <div className="max-h-80 space-y-2 overflow-auto pr-1">
            {result.fixtures.slice(0, 50).map((fixture) => (
              <div key={fixture.id} className="rounded-lg bg-slate-700/70 p-3">
                <p className="text-sm font-medium text-white">
                  {fixture.homeTeam} vs {fixture.awayTeam}
                </p>
                <p className="text-xs text-slate-400">
                  {fixture.league} · {fixture.ukTime || '--:--'} · {fixture.status || 'unknown'} · ID {fixture.id}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-emerald-400">
          Raw JSON
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default function DebugPage() {
  const [date, setDate] = useState(todayInputValue());
  const [vercelResult, setVercelResult] = useState<DebugResult | null>(null);
  const [supabaseResult, setSupabaseResult] = useState<DebugResult | null>(null);
  const [rapidApiResult, setRapidApiResult] = useState<DebugResult | null>(null);
  const [loading, setLoading] = useState<'vercel' | 'supabase' | 'rapidapi' | null>(null);

  const supabaseFunctionUrl = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return null;
    return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/debug-sofascore-fixtures`;
  }, []);

  const runVercelProbe = async () => {
    setLoading('vercel');
    setVercelResult(null);

    try {
      const response = await fetch(`/api/debug/sofascore?date=${date}`);
      const data = await response.json();
      setVercelResult(data);
    } catch (error: any) {
      setVercelResult({ ok: false, source: 'vercel', date, error: error.message });
    } finally {
      setLoading(null);
    }
  };

  const runSupabaseProbe = async () => {
    setLoading('supabase');
    setSupabaseResult(null);

    try {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseFunctionUrl || !anonKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
      }

      const response = await fetch(`${supabaseFunctionUrl}?date=${date}`, {
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
      });
      const data = await response.json();
      setSupabaseResult(data);
    } catch (error: any) {
      setSupabaseResult({
        ok: false,
        source: 'supabase-edge-function',
        date,
        error: error.message,
      });
    } finally {
      setLoading(null);
    }
  };

  const runRapidApiProbe = async () => {
    setLoading('rapidapi');
    setRapidApiResult(null);

    try {
      const response = await fetch(`/api/debug/rapidapi?date=${date}`);
      const data = await response.json();
      setRapidApiResult(data);
    } catch (error: any) {
      setRapidApiResult({ ok: false, source: 'rapidapi', date, error: error.message });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-white">🧪 Debug</h1>
          <p className="mt-1 text-sm text-slate-400">
            SofaScore scheduled-events checks via Vercel, Supabase Edge Functions, and RapidAPI.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Fixture date
          </label>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="picker-input"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={runVercelProbe}
            disabled={loading !== null}
            className="btn-primary"
          >
            {loading === 'vercel' ? 'Calling Vercel...' : 'Call via Vercel'}
          </button>
          <button
            type="button"
            onClick={runSupabaseProbe}
            disabled={loading !== null}
            className="btn-secondary"
          >
            {loading === 'supabase' ? 'Calling Supabase...' : 'Call Supabase Function'}
          </button>
          <button
            type="button"
            onClick={runRapidApiProbe}
            disabled={loading !== null}
            className="btn-primary"
          >
            {loading === 'rapidapi' ? 'Calling RapidAPI...' : 'Test RapidAPI'}
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-bold text-white">Create the Supabase function</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>Install/login to the Supabase CLI: <code>supabase login</code>.</li>
          <li>Link the project: <code>supabase link --project-ref YOUR_PROJECT_REF</code>.</li>
          <li>Deploy this repo function: <code>supabase functions deploy debug-sofascore-fixtures</code>.</li>
          <li>If you want it public for browser testing, deploy with <code>--no-verify-jwt</code>.</li>
        </ol>
        <p className="text-xs text-slate-500">
          Function file: <code>supabase/functions/debug-sofascore-fixtures/index.ts</code>
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-bold text-white">RapidAPI setup</h2>
        <p className="text-sm text-slate-300">
          The <strong className="text-white">Test RapidAPI</strong> button calls{' '}
          <code>sofascore6.p.rapidapi.com</code> for the chosen date. Set the{' '}
          <code>RAPIDAPI_KEY</code> environment variable (Vercel → Settings → Environment Variables)
          to your RapidAPI key before deploying.
        </p>
      </div>

      <ResultPanel title="Vercel result" result={vercelResult} />
      <ResultPanel title="Supabase function result" result={supabaseResult} />
      <ResultPanel title="RapidAPI result" result={rapidApiResult} />
    </div>
  );
}

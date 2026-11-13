// tmdb: the app's only route to TMDB. Keeps the TMDB token private and caches
// title details and US streaming info in the database.
//
// Deploy: Supabase > Edge Functions > Deploy a new function > Via editor,
// name it "tmdb", paste this file, Deploy. Needs the TMDB_TOKEN secret.

import { createClient } from 'npm:@supabase/supabase-js@2';

const TMDB = 'https://api.themoviedb.org/3';
const REGION = 'US';
const DAY_MS = 24 * 60 * 60 * 1000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function tmdb(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${Deno.env.get('TMDB_TOKEN')}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
  return res.json();
}

type Title = { id: string; media_type: 'tv' | 'movie'; tmdb_id: number; name: string; year: number | null; poster_path: string | null };

function toTitle(r: any, type?: 'tv' | 'movie'): Title | null {
  const media_type = type ?? r.media_type;
  if (media_type !== 'tv' && media_type !== 'movie') return null;
  const date = media_type === 'tv' ? r.first_air_date : r.release_date;
  return {
    id: `${media_type}:${r.id}`,
    media_type,
    tmdb_id: r.id,
    name: media_type === 'tv' ? r.name : r.title,
    year: date ? Number(String(date).slice(0, 4)) : null,
    poster_path: r.poster_path ?? null,
  };
}

async function saveTitles(titles: Title[]) {
  if (titles.length) await admin.from('titles').upsert(titles.map((t) => ({ ...t, updated_at: new Date().toISOString() })));
}

function pickProviders(us: any) {
  const slim = (arr: any[] = []) => arr.map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));
  return { flatrate: slim(us?.flatrate), rent: slim(us?.rent), buy: slim(us?.buy), link: us?.link ?? null };
}

async function providersFor(ids: string[]) {
  const out: Record<string, any> = {};
  if (!ids.length) return out;
  const { data: cached } = await admin.from('title_providers').select('title_id, providers, fetched_at').in('title_id', ids);
  const fresh = new Map((cached ?? []).filter((c) => Date.now() - Date.parse(c.fetched_at) < DAY_MS).map((c) => [c.title_id, c.providers]));
  const stale = ids.filter((id) => !fresh.has(id));
  for (const id of ids) if (fresh.has(id)) out[id] = fresh.get(id);

  const rows: any[] = [];
  await Promise.all(stale.map(async (id) => {
    const [type, num] = id.split(':');
    try {
      const data = await tmdb(`/${type}/${num}/watch/providers`);
      const providers = pickProviders(data.results?.[REGION]);
      out[id] = providers;
      rows.push({ title_id: id, providers, fetched_at: new Date().toISOString() });
    } catch {
      out[id] = { flatrate: [], rent: [], buy: [], link: null };
    }
  }));
  if (rows.length) await admin.from('title_providers').upsert(rows);
  return out;
}

async function services() {
  const [tv, movie] = await Promise.all([
    tmdb('/watch/providers/tv', { watch_region: REGION }),
    tmdb('/watch/providers/movie', { watch_region: REGION }),
  ]);
  const seen = new Map<number, any>();
  for (const p of [...tv.results, ...movie.results]) {
    const prio = p.display_priorities?.[REGION] ?? p.display_priority ?? 999;
    if (!seen.has(p.provider_id) || prio < seen.get(p.provider_id).priority) {
      seen.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logo: p.logo_path, priority: prio });
    }
  }
  return [...seen.values()].sort((a, b) => a.priority - b.priority).slice(0, 30);
}

// One quick-pick batch: current popular titles plus all-time classics,
// only titles streaming on the given subscription services in the US.
async function discover(providerIds: number[], page: number) {
  const with_watch_providers = providerIds.join('|');
  const base = { watch_region: REGION, with_watch_providers, include_adult: 'false', page };
  const yearCut = new Date().getFullYear() - 10;
  const [tvNow, movieNow, tvClassic, movieClassic] = await Promise.all([
    tmdb('/discover/tv', { ...base, sort_by: 'popularity.desc' }),
    tmdb('/discover/movie', { ...base, sort_by: 'popularity.desc' }),
    tmdb('/discover/tv', { ...base, sort_by: 'vote_count.desc', 'first_air_date.lte': `${yearCut}-12-31` }),
    tmdb('/discover/movie', { ...base, sort_by: 'vote_count.desc', 'primary_release_date.lte': `${yearCut}-12-31` }),
  ]);
  const now = interleave(tvNow.results.map((r: any) => toTitle(r, 'tv')), movieNow.results.map((r: any) => toTitle(r, 'movie')));
  const classic = interleave(tvClassic.results.map((r: any) => toTitle(r, 'tv')), movieClassic.results.map((r: any) => toTitle(r, 'movie')));
  const titles = [...now, ...classic].filter(Boolean) as Title[];
  await saveTitles(titles);
  return { now: now.filter(Boolean), classic: classic.filter(Boolean) };
}

function interleave<T>(a: T[], b: T[]) {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Signed-in users only.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: user } = await admin.auth.getUser(jwt);
  if (!user?.user) return json({ error: 'Not signed in' }, 401);

  try {
    const body = await req.json();
    switch (body.action) {
      case 'search': {
        const q = String(body.q ?? '').trim();
        if (q.length < 2) return json({ results: [] });
        const data = await tmdb('/search/multi', { query: q, include_adult: 'false', region: REGION });
        const results = data.results.map((r: any) => toTitle(r)).filter(Boolean).slice(0, 12);
        await saveTitles(results);
        return json({ results });
      }
      case 'providers':
        return json({ providers: await providersFor((body.ids ?? []).slice(0, 60)) });
      case 'services':
        return json({ services: await services() });
      case 'discover':
        return json(await discover(body.providers ?? [], Number(body.page ?? 1)));
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

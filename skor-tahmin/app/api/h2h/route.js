import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const matchId = parseInt(url.searchParams.get('match'), 10);
  if (!matchId) {
    return Response.json({ ok: false, error: 'match parametresi gerekli' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  // 7 gün taze kalan önbellek — API limitini korur
  const { data: cached } = await admin
    .from('h2h_cache').select('data, fetched_at')
    .eq('match_id', matchId).maybeSingle();

  const WEEK = 7 * 24 * 3600 * 1000;
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < WEEK) {
    return Response.json({ ok: true, ...cached.data, cached: true });
  }

  const res = await fetch(
    `https://api.football-data.org/v4/matches/${matchId}/head2head?limit=5`,
    { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN }, cache: 'no-store' }
  );
  if (!res.ok) {
    // API vermezse eski önbellek varsa onu döndür
    if (cached) return Response.json({ ok: true, ...cached.data, stale: true });
    return Response.json(
      { ok: false, error: `football-data yanıtı: ${res.status}` }, { status: 502 }
    );
  }
  const d = await res.json();

  const a = d.aggregates || {};
  const payload = {
    agg: a.numberOfMatches != null ? {
      matches: a.numberOfMatches,
      totalGoals: a.totalGoals ?? null,
      homeWins: a.homeTeam?.wins ?? 0,
      draws: a.homeTeam?.draws ?? 0,
      awayWins: a.awayTeam?.wins ?? 0
    } : null,
    list: (d.matches || []).slice(0, 5).map((g) => ({
      date: new Date(g.utcDate).toLocaleDateString('tr-TR', {
        year: 'numeric', month: 'short', day: 'numeric'
      }),
      home: g.homeTeam?.name || '?',
      away: g.awayTeam?.name || '?',
      hs: g.score?.fullTime?.home ?? '–',
      as: g.score?.fullTime?.away ?? '–'
    }))
  };

  await admin.from('h2h_cache').upsert({
    match_id: matchId, data: payload, fetched_at: new Date().toISOString()
  });

  return Response.json({ ok: true, ...payload });
}

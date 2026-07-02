import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Puanlama: tam skor 4 • doğru galibiyet 3 • doğru beraberlik 2 • yanlış 0
function calcPoints(hp, ap, hs, as) {
  if (hs == null || as == null) return null;
  if (hp === hs && ap === as) return 4;
  const pred = Math.sign(hp - ap);
  const real = Math.sign(hs - as);
  if (pred === real) return real === 0 ? 2 : 3;
  return 0;
}

export async function GET(req) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  // Zorlamalı senkron için ?secret=..., normalde 10 dakikada bir çalışır
  const force =
    new URL(req.url).searchParams.get('secret') === process.env.SYNC_SECRET;

  const { data: state } = await admin
    .from('sync_state').select('last_synced_at').eq('id', 1).single();

  const TEN_MIN = 10 * 60 * 1000;
  if (!force && state?.last_synced_at &&
      Date.now() - new Date(state.last_synced_at).getTime() < TEN_MIN) {
    return Response.json({ ok: true, skipped: 'son 10 dk içinde senkronlandı' });
  }

  // Dünya Kupası (WC) tüm maçları
  const res = await fetch(
    'https://api.football-data.org/v4/competitions/WC/matches',
    { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN }, cache: 'no-store' }
  );
  if (!res.ok) {
    return Response.json(
      { ok: false, error: `football-data.org yanıtı: ${res.status}` },
      { status: 502 }
    );
  }
  const data = await res.json();

  const rows = (data.matches || []).map((m) => ({
    id: m.id,
    utc_date: m.utcDate,
    status: m.status,
    stage: m.stage || null,
    group_name: m.group || null,
    home_team: m.homeTeam?.name || 'Belirlenecek',
    away_team: m.awayTeam?.name || 'Belirlenecek',
    home_crest: m.homeTeam?.crest || null,
    away_crest: m.awayTeam?.crest || null,
    home_score: m.score?.fullTime?.home ?? null,
    away_score: m.score?.fullTime?.away ?? null,
    updated_at: new Date().toISOString()
  }));

  if (rows.length) {
    const { error } = await admin.from('matches').upsert(rows);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Biten maçların tahminlerini puanla
  const finished = rows.filter((r) => r.status === 'FINISHED');
  let scored = 0;
  if (finished.length) {
    const byId = Object.fromEntries(finished.map((f) => [f.id, f]));
    const { data: preds } = await admin
      .from('predictions')
      .select('id, match_id, home_pred, away_pred, points')
      .in('match_id', finished.map((f) => f.id));

    const updates = (preds || [])
      .map((p) => {
        const m = byId[p.match_id];
        const pts = calcPoints(p.home_pred, p.away_pred, m.home_score, m.away_score);
        return pts !== p.points ? { id: p.id, points: pts } : null;
      })
      .filter(Boolean);

    for (const u of updates) {
      await admin.from('predictions').update({ points: u.points }).eq('id', u.id);
    }
    scored = updates.length;
  }

  await admin.from('sync_state')
    .update({ last_synced_at: new Date().toISOString() }).eq('id', 1);

  return Response.json({ ok: true, matches: rows.length, scored });
}

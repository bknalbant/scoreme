import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Puanlama (Kicktipp usulü):
// tam skor 4 • doğru gol farkı 3 • doğru sonuç 2 • yanlış 0
// Beraberlikte: tam skor 4, farklı skorlu beraberlik 2
function calcPoints(hp, ap, hs, as) {
  if (hs == null || as == null) return null;
  if (hp === hs && ap === as) return 4;                 // tam skor
  const pred = Math.sign(hp - ap);
  const real = Math.sign(hs - as);
  if (pred !== real) return 0;                          // taraf yanlış
  if (real === 0) return 2;                             // beraberlik, farklı skor
  if (hp - ap === hs - as) return 3;                    // doğru gol farkı
  return 2;                                             // doğru sonuç
}

// Bonus puanları
const BONUS = { qf: 2, sf: 3, champ: 10, scorer: 6, team: 4 };

// İsim karşılaştırma: küçük harf + aksan temizliği
function norm(s) {
  return (s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

export async function GET(req) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const force =
    new URL(req.url).searchParams.get('secret') === process.env.SYNC_SECRET;

  const { data: state } = await admin
    .from('sync_state').select('last_synced_at').eq('id', 1).single();

  const TEN_MIN = 10 * 60 * 1000;
  if (!force && state?.last_synced_at &&
      Date.now() - new Date(state.last_synced_at).getTime() < TEN_MIN) {
    return Response.json({ ok: true, skipped: 'son 10 dk içinde senkronlandı' });
  }

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

  // Turnuva amblemini güncel tut (grup kartlarında görünür)
  try {
    if (data.competition?.emblem) {
      await admin.from('competitions')
        .update({ emblem: data.competition.emblem }).eq('code', 'WC');
    }
  } catch {}

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
    winner: m.score?.winner || null,
    updated_at: new Date().toISOString()
  }));

  if (rows.length) {
    const { error } = await admin.from('matches').upsert(rows);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // ── Maç tahminlerini puanla ──────────────────────────────
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

  // ── Bonus tahminleri puanla ──────────────────────────────
  let bonusScored = 0;
  try {
    const teamsInStage = (stage) => {
      const s = new Set();
      for (const r of rows) {
        if (r.stage === stage) {
          if (r.home_team !== 'Belirlenecek') s.add(r.home_team);
          if (r.away_team !== 'Belirlenecek') s.add(r.away_team);
        }
      }
      return s;
    };
    const quarterSet = teamsInStage('QUARTER_FINALS');
    const semiSet = teamsInStage('SEMI_FINALS');

    // Şampiyon (final bitince; penaltı ihtimali için winner alanı)
    let champion = null;
    const finalMatch = rows.find((r) => r.stage === 'FINAL');
    const tournamentDone = !!(finalMatch && finalMatch.status === 'FINISHED');
    if (tournamentDone) {
      if (finalMatch.winner === 'HOME_TEAM') champion = finalMatch.home_team;
      else if (finalMatch.winner === 'AWAY_TEAM') champion = finalMatch.away_team;
      else if (finalMatch.home_score > finalMatch.away_score) champion = finalMatch.home_team;
      else if (finalMatch.away_score > finalMatch.home_score) champion = finalMatch.away_team;
    }

    // En çok gol atan takım(lar) — turnuva bitince kesinleşir
    const topTeams = new Set();
    if (tournamentDone) {
      const goals = {};
      for (const r of rows) {
        if (r.home_score == null || r.away_score == null) continue;
        goals[r.home_team] = (goals[r.home_team] || 0) + r.home_score;
        goals[r.away_team] = (goals[r.away_team] || 0) + r.away_score;
      }
      const max = Math.max(0, ...Object.values(goals));
      for (const [t, g] of Object.entries(goals)) if (g === max && max > 0) topTeams.add(t);
    }

    // Gol kralı/kralları — turnuva bitince football-data'dan
    let topScorers = [];
    if (tournamentDone) {
      const sres = await fetch(
        'https://api.football-data.org/v4/competitions/WC/scorers?limit=10',
        { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN }, cache: 'no-store' }
      );
      if (sres.ok) {
        const sdata = await sres.json();
        const list = sdata.scorers || [];
        if (list.length) {
          const max = list[0].goals;
          topScorers = list.filter((x) => x.goals === max)
            .map((x) => x.player?.name).filter(Boolean);
        }
      }
    }

    const { data: bonuses } = await admin.from('bonus_predictions').select('*');
    for (const b of bonuses || []) {
      let pts = 0;
      for (const t of b.quarter_finalists || []) if (quarterSet.has(t)) pts += BONUS.qf;
      for (const t of b.semi_finalists || []) if (semiSet.has(t)) pts += BONUS.sf;
      if (champion && b.champion === champion) pts += BONUS.champ;
      if (tournamentDone && b.top_scoring_team && topTeams.has(b.top_scoring_team)) {
        pts += BONUS.team;
      }
      if (tournamentDone && b.top_scorer && topScorers.some((n) =>
        norm(n).includes(norm(b.top_scorer)) || norm(b.top_scorer).includes(norm(n))
      )) {
        pts += BONUS.scorer;
      }
      if (pts !== (b.points ?? 0)) {
        await admin.from('bonus_predictions')
          .update({ points: pts })
          .eq('user_id', b.user_id).eq('group_id', b.group_id);
        bonusScored++;
      }
    }
  } catch (e) {
    // Bonus puanlama hatası maç senkronunu engellemesin
    console.error('bonus scoring:', e);
  }

  // ── Turnuva verileri: puan durumu, gol krallığı, kadrolar ──
  try {
    const H = { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN }, cache: 'no-store' };
    const upserts = [];
    const now = new Date().toISOString();

    const stRes = await fetch('https://api.football-data.org/v4/competitions/WC/standings', H);
    if (stRes.ok) upserts.push({ key: 'standings', data: (await stRes.json()).standings || [], updated_at: now });

    const scRes = await fetch('https://api.football-data.org/v4/competitions/WC/scorers?limit=25', H);
    if (scRes.ok) upserts.push({ key: 'scorers', data: (await scRes.json()).scorers || [], updated_at: now });

    const tmRes = await fetch('https://api.football-data.org/v4/competitions/WC/teams', H);
    if (tmRes.ok) upserts.push({ key: 'teams', data: (await tmRes.json()).teams || [], updated_at: now });

    if (upserts.length) await admin.from('tournament_data').upsert(upserts);
  } catch (e) {
    // Turnuva verisi hatası maç senkronunu engellemesin
    console.error('tournament data:', e);
  }

  await admin.from('sync_state')
    .update({ last_synced_at: new Date().toISOString() }).eq('id', 1);

  return Response.json({ ok: true, matches: rows.length, scored, bonusScored });
}

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const FD = 'https://api.football-data.org/v4';

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

const BONUS = { qf: 2, sf: 3, champ: 10, scorer: 6, team: 4 };

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

  // Aktif grupların turnuvaları
  const [{ data: activeGroups }, { data: compRows }, { data: tdRows }] =
    await Promise.all([
      admin.from('groups').select('id, competition_code').eq('archived', false),
      admin.from('competitions').select('code, type'),
      admin.from('tournament_data').select('key, competition_code, updated_at')
    ]);

  const comps = [...new Set((activeGroups || []).map((g) => g.competition_code))];
  const compType = Object.fromEntries((compRows || []).map((c) => [c.code, c.type]));
  const groupsByComp = {};
  for (const g of activeGroups || []) {
    (groupsByComp[g.competition_code] ||= []).push(g.id);
  }

  if (!comps.length) {
    await admin.from('sync_state')
      .update({ last_synced_at: new Date().toISOString() }).eq('id', 1);
    return Response.json({ ok: true, note: 'aktif grup yok' });
  }

  const H = { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN }, cache: 'no-store' };
  const HOUR = 60 * 60 * 1000;
  let budget = 8; // dakikadaki 10 istek limitine güvenli mesafe
  const report = {};

  // Yan verilerin tazeliği (turnuva başına)
  const extrasAge = {};
  for (const r of tdRows || []) {
    if (r.key === 'standings') {
      extrasAge[r.competition_code] = Date.now() - new Date(r.updated_at).getTime();
    }
  }

  for (const comp of comps) {
    if (budget <= 0) { report[comp] = 'bütçe doldu, sonraki senkronda'; continue; }
    const r = { matches: 0, scored: 0, bonusScored: 0, extras: false };

    // ── 1) Maçlar ─────────────────────────────
    const res = await fetch(`${FD}/competitions/${comp}/matches`, H);
    budget--;
    if (!res.ok) { report[comp] = `maçlar alınamadı: ${res.status}`; continue; }
    const data = await res.json();

    try {
      if (data.competition?.emblem) {
        await admin.from('competitions')
          .update({ emblem: data.competition.emblem }).eq('code', comp);
      }
    } catch {}

    const rows = (data.matches || []).map((m) => ({
      id: m.id,
      competition_code: comp,
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
      if (error) { report[comp] = 'kayıt hatası: ' + error.message; continue; }
    }
    r.matches = rows.length;

    // ── 2) Biten maçların tahminlerini puanla ──
    const finished = rows.filter((x) => x.status === 'FINISHED');
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
      r.scored = updates.length;
    }

    // ── 3) Yan veriler: saatte bir ve bütçe elverirse ──
    const stale = extrasAge[comp] == null || extrasAge[comp] > HOUR;
    if ((stale || force) && budget >= 3) {
      try {
        const now = new Date().toISOString();
        const upserts = [];
        const stRes = await fetch(`${FD}/competitions/${comp}/standings`, H); budget--;
        if (stRes.ok) upserts.push({
          key: 'standings', competition_code: comp,
          data: (await stRes.json()).standings || [], updated_at: now
        });
        const scRes = await fetch(`${FD}/competitions/${comp}/scorers?limit=25`, H); budget--;
        if (scRes.ok) upserts.push({
          key: 'scorers', competition_code: comp,
          data: (await scRes.json()).scorers || [], updated_at: now
        });
        const tmRes = await fetch(`${FD}/competitions/${comp}/teams`, H); budget--;
        if (tmRes.ok) upserts.push({
          key: 'teams', competition_code: comp,
          data: (await tmRes.json()).teams || [], updated_at: now
        });
        if (upserts.length) await admin.from('tournament_data').upsert(upserts);
        r.extras = true;
      } catch (e) {
        console.error('extras', comp, e);
      }
    }

    // ── 4) Bonus puanlama (yalnızca kupa turnuvaları) ──
    if (compType[comp] === 'CUP' && groupsByComp[comp]?.length) {
      try {
        const teamsInStage = (stage) => {
          const s = new Set();
          for (const x of rows) {
            if (x.stage === stage) {
              if (x.home_team !== 'Belirlenecek') s.add(x.home_team);
              if (x.away_team !== 'Belirlenecek') s.add(x.away_team);
            }
          }
          return s;
        };
        const quarterSet = teamsInStage('QUARTER_FINALS');
        const semiSet = teamsInStage('SEMI_FINALS');

        let champion = null;
        const finalMatch = rows.find((x) => x.stage === 'FINAL');
        const tournamentDone = !!(finalMatch && finalMatch.status === 'FINISHED');
        if (tournamentDone) {
          if (finalMatch.winner === 'HOME_TEAM') champion = finalMatch.home_team;
          else if (finalMatch.winner === 'AWAY_TEAM') champion = finalMatch.away_team;
          else if (finalMatch.home_score > finalMatch.away_score) champion = finalMatch.home_team;
          else if (finalMatch.away_score > finalMatch.home_score) champion = finalMatch.away_team;
        }

        const topTeams = new Set();
        let topScorers = [];
        if (tournamentDone) {
          const goals = {};
          for (const x of rows) {
            if (x.home_score == null || x.away_score == null) continue;
            goals[x.home_team] = (goals[x.home_team] || 0) + x.home_score;
            goals[x.away_team] = (goals[x.away_team] || 0) + x.away_score;
          }
          const max = Math.max(0, ...Object.values(goals));
          for (const [t, g] of Object.entries(goals)) if (g === max && max > 0) topTeams.add(t);

          // Gol kralları: son senkronlanan listeden (ek istek yok)
          const { data: scRow } = await admin.from('tournament_data')
            .select('data').eq('key', 'scorers').eq('competition_code', comp).maybeSingle();
          const list = scRow?.data || [];
          if (list.length) {
            const maxG = list[0].goals;
            topScorers = list.filter((x) => x.goals === maxG)
              .map((x) => x.player?.name).filter(Boolean);
          }
        }

        const { data: bonuses } = await admin.from('bonus_predictions')
          .select('*').in('group_id', groupsByComp[comp]);
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
            r.bonusScored++;
          }
        }
      } catch (e) {
        console.error('bonus', comp, e);
      }
    }

    report[comp] = r;
  }

  await admin.from('sync_state')
    .update({ last_synced_at: new Date().toISOString() }).eq('id', 1);

  return Response.json({ ok: true, report });
}

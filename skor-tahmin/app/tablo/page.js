'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { getActiveGroupId } from '../../lib/group';

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

export default function TabloPage() {
  const [rows, setRows] = useState(null);
  const [hasLive, setHasLive] = useState(false);
  const [myId, setMyId] = useState(null);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/giris'); return; }
      setMyId(session.user.id);
      const gid = getActiveGroupId();
      if (!gid) { router.push('/gruplar'); return; }


      fetch('/api/sync').catch(() => {});

      const [{ data: profiles }, { data: preds }, { data: matches }, { data: bonuses }] =
        await Promise.all([
          supabase.from('group_members')
            .select('user_id, profiles(username)').eq('group_id', gid),
          supabase.from('predictions')
            .select('user_id, match_id, home_pred, away_pred, points')
            .eq('group_id', gid),
          supabase.from('matches')
            .select('id, status, home_score, away_score, utc_date'),
          supabase.from('bonus_predictions')
            .select('user_id, points').eq('group_id', gid)
        ]);

      const memberList = (profiles || []).map((r) => ({
        id: r.user_id, username: r.profiles?.username || '???'
      }));

      const matchById = Object.fromEntries((matches || []).map((m) => [m.id, m]));
      const bonusById = Object.fromEntries(
        (bonuses || []).map((b) => [b.user_id, b.points ?? 0])
      );

      const stats = {};
      for (const pr of memberList) {
        stats[pr.id] = {
          id: pr.id, username: pr.username,
          total: 0, live: 0, bonus: bonusById[pr.id] || 0,
          exact: 0, win: 0, draw: 0, played: 0
        };
      }

      let anyLive = false;
      for (const p of preds || []) {
        const s = stats[p.user_id];
        const m = matchById[p.match_id];
        if (!s || !m) continue;

        if (m.status === 'FINISHED' && p.points != null) {
          s.total += p.points;
          s.played += 1;
          if (p.points === 4) s.exact += 1;
          else if (p.points === 3) s.win += 1;
          else if (p.points === 2) s.draw += 1;
        } else if (
          (m.status === 'IN_PLAY' || m.status === 'PAUSED') &&
          m.home_score != null && m.away_score != null
        ) {
          const prov = calcPoints(p.home_pred, p.away_pred, m.home_score, m.away_score);
          if (prov != null) {
            s.live += prov;
            if (prov > 0) anyLive = true;
          }
        }
      }
      setHasLive(anyLive || (matches || []).some(
        (m) => m.status === 'IN_PLAY' || m.status === 'PAUSED'
      ));

      const sorted = Object.values(stats).sort(
        (a, b) =>
          (b.total + b.bonus + b.live) - (a.total + a.bonus + a.live) ||
          b.exact - a.exact ||
          a.username.localeCompare(b.username)
      );
      setRows(sorted);
    }
    load();
  }, [router]);

  if (!rows) return <div className="empty">Yükleniyor…</div>;

  return (
    <>
      <div className="day-header">Genel sıralama</div>
      <table className="standings">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th>Oyuncu</th>
            <th className="num">Maç</th>
            <th className="num" title="Tam skor (+4)">Tam</th>
            <th className="num" title="Doğru gol farkı (+3)">Fark</th>
            <th className="num" title="Doğru sonuç (+2)">Snç</th>
            <th className="num" title="Bonus tahminlerden gelen puan">Bonus</th>
            <th className="num">Puan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.id === myId ? 'me' : ''}>
              <td className="rank">{i + 1}</td>
              <td>{r.username}</td>
              <td className="num">{r.played}</td>
              <td className="num">{r.exact}</td>
              <td className="num">{r.win}</td>
              <td className="num">{r.draw}</td>
              <td className="num">{r.bonus}</td>
              <td className="num total">
                {r.total + r.bonus}
                {r.live > 0 && (
                  <span style={{
                    fontSize: 12, fontStyle: 'italic', fontWeight: 400,
                    color: 'var(--amber)', opacity: 0.85, marginLeft: 6
                  }}>
                    +{r.live}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pred-note" style={{ marginTop: 16 }}>
        Puanlama: tam skor 4 • doğru gol farkı 3 • doğru sonuç 2 — detaylar Oyun Kuralları sayfasında
        {hasLive && (
          <>
            <br />
            <span style={{ fontStyle: 'italic' }}>
              +X: canlı maçın anlık skoruna göre geçici puan — maç bitince kesinleşir.
            </span>
          </>
        )}
      </p>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function TabloPage() {
  const [rows, setRows] = useState(null);
  const [myId, setMyId] = useState(null);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/giris'); return; }
      setMyId(session.user.id);

      const [{ data: profiles }, { data: preds }] = await Promise.all([
        supabase.from('profiles').select('id, username'),
        supabase.from('predictions').select('user_id, points').not('points', 'is', null)
      ]);

      const stats = {};
      for (const pr of profiles || []) {
        stats[pr.id] = { id: pr.id, username: pr.username, total: 0, exact: 0, win: 0, draw: 0, played: 0 };
      }
      for (const p of preds || []) {
        const s = stats[p.user_id];
        if (!s) continue;
        s.total += p.points;
        s.played += 1;
        if (p.points === 4) s.exact += 1;
        else if (p.points === 3) s.win += 1;
        else if (p.points === 2) s.draw += 1;
      }
      const sorted = Object.values(stats).sort(
        (a, b) => b.total - a.total || b.exact - a.exact || a.username.localeCompare(b.username)
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
            <th className="num" title="Galibiyet (+3)">Gal</th>
            <th className="num" title="Beraberlik (+2)">Ber</th>
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
              <td className="num total">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pred-note" style={{ marginTop: 16 }}>
        Puanlama: tam skor 4 • doğru galibiyet 3 • doğru beraberlik 2
      </p>
    </>
  );
}

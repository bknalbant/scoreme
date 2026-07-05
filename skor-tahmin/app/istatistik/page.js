'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { getActiveGroupId } from '../../lib/group';

const MIN_PLAYED = 3; // ortalamaya dayalı rekorlar için alt sınır

function FormDot({ p }) {
  const style = {
    width: 12, height: 12, borderRadius: '50%', display: 'inline-block',
    marginLeft: 4, border: '1px solid var(--line)', background: 'transparent'
  };
  if (p === 4) { style.background = 'var(--amber)'; style.border = '1px solid var(--amber)'; }
  else if (p === 3) { style.border = '1px solid var(--amber)'; }
  else if (p === 2) { style.background = 'var(--pitch-3)'; style.border = '1px solid var(--chalk)'; }
  else { style.opacity = 0.35; }
  return <span style={style} title={`${p} puan`} />;
}

function RecordCard({ icon, title, name, value, note }) {
  return (
    <div style={{
      background: 'var(--pitch-2)', border: '1px solid var(--line)',
      borderRadius: 10, padding: '14px 16px'
    }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8
      }}>{icon} {title}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)' }}>
        {name ?? '—'}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
        {value}{note ? ` · ${note}` : ''}
      </div>
    </div>
  );
}

export default function IstatistikPage() {
  const [players, setPlayers] = useState(null);
  const [records, setRecords] = useState({});
  const [myId, setMyId] = useState(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/giris'); return; }
      setMyId(session.user.id);
      const gid = getActiveGroupId();
      if (!gid) { router.push('/gruplar'); return; }
      const { data: grp } = await supabase.from('groups')
        .select('competition_code').eq('id', gid).single();
      const comp = grp?.competition_code || 'WC';



      const [{ data: profiles }, { data: preds }, { data: matches }] =
        await Promise.all([
          supabase.from('group_members')
            .select('user_id, profiles(username)').eq('group_id', gid),
          supabase.from('predictions')
            .select('user_id, match_id, home_pred, away_pred, points')
            .eq('group_id', gid),
          supabase.from('matches').select('id, status, utc_date')
            .eq('competition_code', comp)
        ]);

      const memberList = (profiles || []).map((r) => ({
        id: r.user_id, username: r.profiles?.username || '???'
      }));

      const matchById = Object.fromEntries((matches || []).map((m) => [m.id, m]));
      const finishedCount = (matches || [])
        .filter((m) => m.status === 'FINISHED').length;

      const stats = {};
      for (const p of memberList) {
        stats[p.id] = {
          id: p.id, username: p.username,
          played: 0, total: 0, exact: 0, diff: 0, result: 0, zeros: 0,
          goalsSum: 0, goalsCnt: 0, form: [] // [utc, points]
        };
      }

      for (const p of preds || []) {
        const s = stats[p.user_id];
        const m = matchById[p.match_id];
        if (!s || !m) continue;
        // Cömertlik/tutuculuk: başlamış maçlardaki tahminler (herkes için görünür olanlar)
        if (new Date(m.utc_date).getTime() <= Date.now()) {
          s.goalsSum += p.home_pred + p.away_pred;
          s.goalsCnt += 1;
        }
        if (m.status === 'FINISHED' && p.points != null) {
          s.played += 1;
          s.total += p.points;
          if (p.points === 4) s.exact += 1;
          else if (p.points === 3) s.diff += 1;
          else if (p.points === 2) s.result += 1;
          else s.zeros += 1;
          s.form.push([new Date(m.utc_date).getTime(), p.points]);
        }
      }

      const list = Object.values(stats).map((s) => {
        s.avg = s.played ? s.total / s.played : 0;
        s.avgGoals = s.goalsCnt ? s.goalsSum / s.goalsCnt : 0;
        s.missed = Math.max(0, finishedCount - s.played);
        s.form.sort((a, b) => a[0] - b[0]);
        s.last5 = s.form.slice(-5).map((f) => f[1]);
        return s;
      }).sort((a, b) => b.avg - a.avg || b.total - a.total);

      const eligible = list.filter((s) => s.played >= MIN_PLAYED);
      const top = (arr, key, dir = 1) =>
        arr.length
          ? arr.slice().sort((a, b) => dir * (b[key] - a[key]))[0]
          : null;

      const isabet = top(eligible, 'avg');
      const tamskor = top(list.filter((s) => s.exact > 0), 'exact');
      const comert = top(eligible.filter((s) => s.goalsCnt > 0), 'avgGoals');
      const tutucu = top(eligible.filter((s) => s.goalsCnt > 0), 'avgGoals', -1);
      const uzgun = top(list.filter((s) => s.zeros > 0), 'zeros');
      const devamsiz = top(list.filter((s) => s.missed > 0), 'missed');

      setRecords({
        isabet: isabet && { name: isabet.username, value: `maç başına ${isabet.avg.toFixed(2)} puan` },
        tamskor: tamskor && { name: tamskor.username, value: `${tamskor.exact} tam skor` },
        comert: comert && { name: comert.username, value: `tahmin başına ${comert.avgGoals.toFixed(1)} gol bekliyor` },
        tutucu: tutucu && { name: tutucu.username, value: `tahmin başına ${tutucu.avgGoals.toFixed(1)} gol bekliyor` },
        uzgun: uzgun && { name: uzgun.username, value: `${uzgun.zeros} tahmin sıfır çekti` },
        devamsiz: devamsiz && { name: devamsiz.username, value: `${devamsiz.missed} maça tahmin girmedi` }
      });
      setPlayers(list);
    })();
  }, [router]);

  if (!players) return <div className="empty">Yükleniyor…</div>;

  return (
    <>
      <div className="day-header">Rekortmenler</div>
      <div style={{ display: 'grid', gap: 10, marginBottom: 8,
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        <RecordCard icon="🎯" title="En isabetli" {...(records.isabet || {})} />
        <RecordCard icon="💎" title="Tam skor kralı" {...(records.tamskor || {})} />
        <RecordCard icon="🎉" title="En cömert (bol gol)" {...(records.comert || {})} />
        <RecordCard icon="🧱" title="En tutucu (az gol)" {...(records.tutucu || {})} />
        <RecordCard icon="😭" title="En çok üzülen" {...(records.uzgun || {})} />
        <RecordCard icon="👻" title="En devamsız" {...(records.devamsiz || {})} />
      </div>
      <p className="pred-note" style={{ marginBottom: 24 }}>
        Ortalamaya dayalı unvanlar için en az {MIN_PLAYED} puanlanmış tahmin gerekir.
      </p>

      <div className="day-header">Oyuncu istatistikleri</div>
      <table className="standings">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th>Oyuncu</th>
            <th className="num" title="Puanlanan tahmin">Maç</th>
            <th className="num" title="Maç başına ortalama puan">Ort</th>
            <th className="num" title="Tam skor sayısı">Tam</th>
            <th className="num" title="Sıfır puanlı tahmin">0'lar</th>
            <th className="num" title="Tahmin girilmeyen biten maç">Kaçan</th>
            <th style={{ textAlign: 'right' }} title="Son 5 puanlanan tahmin">Son 5</th>
          </tr>
        </thead>
        <tbody>
          {players.map((s, i) => (
            <tr key={s.id} className={s.id === myId ? 'me' : ''}>
              <td className="rank">{i + 1}</td>
              <td>{s.username}</td>
              <td className="num">{s.played}</td>
              <td className="num total" style={{ fontSize: 14 }}>{s.avg.toFixed(2)}</td>
              <td className="num">{s.exact}</td>
              <td className="num">{s.zeros}</td>
              <td className="num">{s.missed}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {s.last5.length
                  ? s.last5.map((p, j) => <FormDot key={j} p={p} />)
                  : <span className="pred-note">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pred-note" style={{ marginTop: 16 }}>
        Sıralama maç başına ortalama puana göredir — az maça girip yüksek ortalama tutturmak
        mümkün, o yüzden "Maç" sütunuyla birlikte okuyun. 😄 Son 5: ● tam skor, ○ gol farkı,
        gri ● doğru sonuç, soluk ○ sıfır.
      </p>
    </>
  );
}

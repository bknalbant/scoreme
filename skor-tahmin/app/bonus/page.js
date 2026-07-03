'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

const PTS = { qf: 2, sf: 3, champ: 10, scorer: 6, team: 4 };

function chipStyle(active, disabled) {
  return {
    padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${active ? 'var(--amber-dim)' : 'var(--line)'}`,
    background: active ? 'var(--pitch-3)' : 'transparent',
    color: active ? 'var(--amber)' : 'var(--chalk)',
    opacity: disabled && !active ? 0.35 : 1,
    userSelect: 'none'
  };
}

function fmtDeadline(ts) {
  return new Date(ts).toLocaleString('tr-TR', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Istanbul'
  });
}

export default function BonusPage() {
  const [userId, setUserId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [deadline, setDeadline] = useState(null);
  const [locked, setLocked] = useState(false);
  const [qf, setQf] = useState([]);
  const [sf, setSf] = useState([]);
  const [champ, setChamp] = useState(null);
  const [scorer, setScorer] = useState('');
  const [topTeam, setTopTeam] = useState('');
  const [others, setOthers] = useState([]);
  const [names, setNames] = useState({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/giris'); return; }
      setUserId(session.user.id);

      const [{ data: ms }, { data: mine }, { data: profiles }] = await Promise.all([
        supabase.from('matches').select('stage, utc_date, home_team, away_team'),
        supabase.from('bonus_predictions').select('*')
          .eq('user_id', session.user.id).maybeSingle(),
        supabase.from('profiles').select('id, username')
      ]);

      // Seçilebilir takımlar: son 32'ye kalanlar
      const set = new Set();
      for (const m of ms || []) {
        if (m.stage === 'LAST_32') {
          if (m.home_team !== 'Belirlenecek') set.add(m.home_team);
          if (m.away_team !== 'Belirlenecek') set.add(m.away_team);
        }
      }
      if (set.size === 0) {
        for (const m of ms || []) {
          if (m.home_team !== 'Belirlenecek') set.add(m.home_team);
          if (m.away_team !== 'Belirlenecek') set.add(m.away_team);
        }
      }
      setTeams([...set].sort());

      // Kilit: ilk son 16 maçının başlama anı
      const dts = (ms || []).filter((m) => m.stage === 'LAST_16')
        .map((m) => new Date(m.utc_date).getTime());
      const dl = dts.length ? Math.min(...dts) : null;
      setDeadline(dl);
      const isLocked = dl != null && Date.now() >= dl;
      setLocked(isLocked);

      if (mine) {
        setQf(mine.quarter_finalists || []);
        setSf(mine.semi_finalists || []);
        setChamp(mine.champion || null);
        setScorer(mine.top_scorer || '');
        setTopTeam(mine.top_scoring_team || '');
      }
      setNames(Object.fromEntries((profiles || []).map((p) => [p.id, p.username])));

      if (isLocked) {
        const { data: all } = await supabase.from('bonus_predictions').select('*');
        setOthers(all || []);
      }
      setLoading(false);
    })();
  }, [router]);

  function toggleQf(t) {
    if (locked) return;
    if (qf.includes(t)) {
      setQf(qf.filter((x) => x !== t));
      setSf(sf.filter((x) => x !== t));
      if (champ === t) setChamp(null);
    } else if (qf.length < 8) {
      setQf([...qf, t]);
    }
  }
  function toggleSf(t) {
    if (locked) return;
    if (sf.includes(t)) {
      setSf(sf.filter((x) => x !== t));
      if (champ === t) setChamp(null);
    } else if (sf.length < 4) {
      setSf([...sf, t]);
    }
  }

  async function save() {
    setError('');
    const { error: e } = await supabase.from('bonus_predictions').upsert({
      user_id: userId,
      quarter_finalists: qf,
      semi_finalists: sf,
      champion: champ,
      top_scorer: scorer.trim() || null,
      top_scoring_team: topTeam || null,
      updated_at: new Date().toISOString()
    });
    if (e) { setError('Kaydedilemedi: ' + e.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return <div className="empty">Yükleniyor…</div>;

  return (
    <>
      <div className="day-header">Bonus tahminler</div>
      <p className="pred-note" style={{ margin: '0 0 4px' }}>
        Çeyrek finalist +{PTS.qf} (tanesi) • Yarı finalist +{PTS.sf} (tanesi) •
        Şampiyon +{PTS.champ} • Gol kralı +{PTS.scorer} • En golcü takım +{PTS.team}
      </p>
      <p className="pred-note" style={{ margin: '0 0 20px' }}>
        {locked
          ? 'Bonus tahminler kilitlendi.'
          : deadline
            ? `Son tarih: ${fmtDeadline(deadline)} — sonrasında kilitlenir ve herkese görünür.`
            : 'Son 16 fikstürü netleşince kilit tarihi burada görünecek.'}
      </p>

      <div className="day-header">Çeyrek finalistler ({qf.length}/8)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {teams.map((t) => (
          <span key={t} style={chipStyle(qf.includes(t), locked || (!qf.includes(t) && qf.length >= 8))}
                onClick={() => toggleQf(t)}>{t}</span>
        ))}
      </div>

      <div className="day-header">Yarı finalistler ({sf.length}/4)</div>
      {qf.length === 0
        ? <p className="pred-note">Önce çeyrek finalistleri seçin — yarı finalistler onların arasından seçilir.</p>
        : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {qf.map((t) => (
              <span key={t} style={chipStyle(sf.includes(t), locked || (!sf.includes(t) && sf.length >= 4))}
                    onClick={() => toggleSf(t)}>{t}</span>
            ))}
          </div>
        )}

      <div className="day-header">Şampiyon</div>
      {sf.length === 0
        ? <p className="pred-note">Önce yarı finalistleri seçin.</p>
        : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sf.map((t) => (
              <span key={t} style={chipStyle(champ === t, locked)}
                    onClick={() => !locked && setChamp(champ === t ? null : t)}>🏆 {t}</span>
            ))}
          </div>
        )}

      <div className="day-header">Gol kralı</div>
      <input
        value={scorer} disabled={locked}
        onChange={(e) => setScorer(e.target.value)}
        placeholder="Oyuncu adı — örn. Mbappe"
        style={{ width: '100%', maxWidth: 320, padding: 10, fontSize: 15,
                 background: '#071a13', color: 'var(--chalk)',
                 border: '1px solid var(--line)', borderRadius: 6, outline: 'none' }}
      />
      <p className="pred-note" style={{ marginTop: 6 }}>
        Yazım farkları tolere edilir (örn. "Mbappe" = "Kylian Mbappé").
      </p>

      <div className="day-header">En çok gol atan takım</div>
      <select
        value={topTeam} disabled={locked}
        onChange={(e) => setTopTeam(e.target.value)}
        style={{ padding: 10, fontSize: 14, background: '#071a13',
                 color: 'var(--chalk)', border: '1px solid var(--line)',
                 borderRadius: 6, minWidth: 220 }}>
        <option value="">Seçin…</option>
        {teams.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      {error && <div className="error">{error}</div>}
      {!locked && (
        <div style={{ marginTop: 24 }}>
          <button className={`save ${saved ? 'saved' : ''}`} onClick={save}
                  style={{ padding: '10px 22px', fontSize: 14 }}>
            {saved ? 'Kaydedildi ✓' : 'Bonus tahminleri kaydet'}
          </button>
        </div>
      )}

      {locked && others.length > 0 && (
        <>
          <div className="day-header" style={{ marginTop: 32 }}>Herkesin bonus tahminleri</div>
          {others.map((o) => (
            <div key={o.user_id} className="match" style={{ fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ color: o.user_id === userId ? 'var(--amber)' : 'var(--chalk)' }}>
                  {names[o.user_id] || '???'}{o.user_id === userId ? ' (sen)' : ''}
                </strong>
                <span className="points p3">Bonus: {o.points ?? 0} puan</span>
              </div>
              <div className="pred-note">Çeyrek: {(o.quarter_finalists || []).join(', ') || '—'}</div>
              <div className="pred-note">Yarı: {(o.semi_finalists || []).join(', ') || '—'}</div>
              <div className="pred-note">
                Şampiyon: {o.champion || '—'} • Gol kralı: {o.top_scorer || '—'} • En golcü takım: {o.top_scoring_team || '—'}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

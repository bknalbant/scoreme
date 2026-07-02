'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

const STATUS_TR = {
  IN_PLAY: 'Oynanıyor', PAUSED: 'Devre arası', FINISHED: 'Bitti',
  TIMED: '', SCHEDULED: '', POSTPONED: 'Ertelendi', CANCELLED: 'İptal'
};

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('tr-TR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul'
  });
}
function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul'
  });
}
function pointsLabel(p) {
  if (p === 4) return 'Tam skor +4';
  if (p === 3) return 'Galibiyet +3';
  if (p === 2) return 'Beraberlik +2';
  return '0 puan';
}

export default function Home() {
  const [userId, setUserId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [preds, setPreds] = useState({});   // match_id -> {home_pred, away_pred, points}
  const [drafts, setDrafts] = useState({}); // match_id -> {h, a}
  const [savedFlash, setSavedFlash] = useState({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/giris'); return; }
      setUserId(session.user.id);

      // Sonuçları arka planda tazele (10 dk'da bir gerçekten çalışır)
      fetch('/api/sync').catch(() => {});

      const [{ data: ms }, { data: ps }] = await Promise.all([
        supabase.from('matches').select('*').order('utc_date'),
        supabase.from('predictions')
          .select('match_id, home_pred, away_pred, points')
          .eq('user_id', session.user.id)
      ]);
      setMatches(ms || []);
      setPreds(Object.fromEntries((ps || []).map((p) => [p.match_id, p])));
      setLoading(false);
    }
    init();
  }, [router]);

  const days = useMemo(() => {
    const now = Date.now();
    // Bitmemiş + son 24 saatte biten maçları göster
    const visible = matches.filter((m) =>
      m.status !== 'FINISHED' ||
      now - new Date(m.utc_date).getTime() < 36 * 3600 * 1000
    );
    const groups = new Map();
    for (const m of visible) {
      const key = fmtDay(m.utc_date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    return [...groups.entries()];
  }, [matches]);

  function setDraft(id, side, val) {
    const clean = val === '' ? '' : Math.max(0, Math.min(20, parseInt(val, 10) || 0));
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [side]: clean } }));
  }

  async function save(match) {
    const existing = preds[match.id];
    const d = drafts[match.id] || {};
    const h = d.h ?? existing?.home_pred;
    const a = d.a ?? existing?.away_pred;
    if (h === '' || a === '' || h == null || a == null) return;

    const { error } = await supabase.from('predictions').upsert(
      { user_id: userId, match_id: match.id, home_pred: h, away_pred: a,
        updated_at: new Date().toISOString() },
      { onConflict: 'user_id,match_id' }
    );
    if (!error) {
      setPreds((p) => ({ ...p, [match.id]: { match_id: match.id, home_pred: h, away_pred: a, points: null } }));
      setSavedFlash((s) => ({ ...s, [match.id]: true }));
      setTimeout(() => setSavedFlash((s) => ({ ...s, [match.id]: false })), 2000);
    } else {
      alert('Kaydedilemedi: ' + error.message);
    }
  }

  if (loading) return <div className="empty">Yükleniyor…</div>;
  if (!days.length) return <div className="empty">Görünürde maç yok. Sonuçlar birazdan senkronlanır.</div>;

  const now = Date.now();

  return (
    <>
      {days.map(([day, ms]) => (
        <section key={day}>
          <div className="day-header">{day}</div>
          {ms.map((m) => {
            const started = new Date(m.utc_date).getTime() <= now;
            const finished = m.status === 'FINISHED';
            const live = m.status === 'IN_PLAY' || m.status === 'PAUSED';
            const p = preds[m.id];
            const d = drafts[m.id] || {};
            const hVal = d.h ?? p?.home_pred ?? '';
            const aVal = d.a ?? p?.away_pred ?? '';
            const dirty = d.h !== undefined || d.a !== undefined;

            return (
              <div className="match" key={m.id}>
                <div className="meta">
                  <span>{m.group_name || m.stage?.replaceAll('_', ' ') || ''}</span>
                  <span className={live ? 'live' : ''}>
                    {STATUS_TR[m.status] || ''} {!started && fmtTime(m.utc_date)}
                  </span>
                </div>

                <div className="row">
                  <div className="team">
                    {m.home_crest && <img src={m.home_crest} alt="" />}
                    <span>{m.home_team}</span>
                  </div>

                  <div className="board">
                    {started ? (
                      <>
                        <span className="digit">{m.home_score ?? '–'}</span>
                        <span className="sep">:</span>
                        <span className="digit">{m.away_score ?? '–'}</span>
                      </>
                    ) : (
                      <>
                        <input className="digit" inputMode="numeric" value={hVal}
                               onChange={(e) => setDraft(m.id, 'h', e.target.value)} />
                        <span className="sep">:</span>
                        <input className="digit" inputMode="numeric" value={aVal}
                               onChange={(e) => setDraft(m.id, 'a', e.target.value)} />
                      </>
                    )}
                  </div>

                  <div className="team right">
                    <span>{m.away_team}</span>
                    {m.away_crest && <img src={m.away_crest} alt="" />}
                  </div>
                </div>

                <div className="foot">
                  <span className="pred-note">
                    {started
                      ? p ? `Tahminin: ${p.home_pred}–${p.away_pred}` : 'Tahmin girilmedi'
                      : p && !dirty ? 'Tahmin kaydedildi' : ''}
                  </span>
                  {!started && (
                    <button
                      className={`save ${savedFlash[m.id] ? 'saved' : ''}`}
                      disabled={hVal === '' || aVal === ''}
                      onClick={() => save(m)}
                    >
                      {savedFlash[m.id] ? 'Kaydedildi ✓' : p ? 'Güncelle' : 'Kaydet'}
                    </button>
                  )}
                  {finished && p?.points != null && (
                    <span className={`points p${p.points}`}>{pointsLabel(p.points)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

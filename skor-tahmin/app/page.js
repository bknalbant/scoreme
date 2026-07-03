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
  const [preds, setPreds] = useState({});      // benim tahminlerim
  const [allPreds, setAllPreds] = useState({}); // başlamış maçlarda herkesin tahmini
  const [flags, setFlags] = useState({});       // match_id -> Set(user_id): kim tahmin girdi
  const [players, setPlayers] = useState([]);   // tüm oyuncular [{id, username}]
  const [drafts, setDrafts] = useState({});
  const [savedFlash, setSavedFlash] = useState({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/giris'); return; }
      setUserId(session.user.id);

      fetch('/api/sync').catch(() => {});

      const [{ data: ms }, { data: myPs }, { data: everyPs }, { data: profiles }, { data: fl }] =
        await Promise.all([
          supabase.from('matches').select('*').order('utc_date'),
          supabase.from('predictions')
            .select('match_id, home_pred, away_pred, points')
            .eq('user_id', session.user.id),
          supabase.from('predictions')
            .select('match_id, user_id, home_pred, away_pred, points'),
          supabase.from('profiles').select('id, username'),
          supabase.from('prediction_flags').select('match_id, user_id')
        ]);

      setMatches(ms || []);
      setPreds(Object.fromEntries((myPs || []).map((p) => [p.match_id, p])));

      const sortedPlayers = (profiles || [])
        .slice().sort((a, b) => a.username.localeCompare(b.username));
      setPlayers(sortedPlayers);
      const names = Object.fromEntries(sortedPlayers.map((p) => [p.id, p.username]));

      const grouped = {};
      for (const p of everyPs || []) {
        if (!grouped[p.match_id]) grouped[p.match_id] = [];
        grouped[p.match_id].push({
          userId: p.user_id,
          username: names[p.user_id] || '???',
          h: p.home_pred, a: p.away_pred, points: p.points
        });
      }
      for (const list of Object.values(grouped)) {
        list.sort((x, y) => (y.points ?? -1) - (x.points ?? -1) ||
                            x.username.localeCompare(y.username));
      }
      setAllPreds(grouped);

      const fmap = {};
      for (const f of fl || []) {
        if (!fmap[f.match_id]) fmap[f.match_id] = new Set();
        fmap[f.match_id].add(f.user_id);
      }
      setFlags(fmap);

      setLoading(false);
    }
    init();
  }, [router]);

  const days = useMemo(() => {
    const now = Date.now();
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
      setFlags((f) => {
        const next = { ...f };
        next[match.id] = new Set(next[match.id] || []);
        next[match.id].add(userId);
        return next;
      });
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
            const others = started ? (allPreds[m.id] || []) : [];
            const flagged = flags[m.id] || new Set();

            return (
              <div className="match" key={m.id}>
                <div className="meta">
                  <span>{m.group_name || m.stage?.replaceAll('_', ' ') || ''}</span>
                  <span className={live || (started && !finished) ? 'live' : ''}>
                    {(() => {
                      if (!started) return fmtTime(m.utc_date);
                      if (finished) return 'Bitti';
                      if (m.status === 'PAUSED') return 'Devre arası';
                      const dk = Math.floor((now - new Date(m.utc_date).getTime()) / 60000);
                      if (dk <= 130) return `Başladı · ~${Math.min(dk, 90)}'`;
                      return 'Bitmek üzere';
                    })()}
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
                    {!started && p && !dirty ? 'Tahmin kaydedildi' : ''}
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
                </div>

                {/* Maç öncesi: kim tahmin girmiş (skorlar gizli) */}
                {!started && players.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10 }}>
                    {players.map((pl) => {
                      const hasPred = flagged.has(pl.id);
                      return (
                        <div key={pl.id} style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', padding: '4px 0', fontSize: 13
                        }}>
                          <span style={{
                            color: pl.id === userId ? 'var(--amber)' : 'var(--chalk)',
                            fontWeight: pl.id === userId ? 700 : 400,
                            opacity: hasPred ? 1 : 0.55
                          }}>
                            {pl.username}{pl.id === userId ? ' (sen)' : ''}
                          </span>
                          {hasPred ? (
                            <span style={{
                              fontFamily: 'var(--font-display)',
                              fontVariantNumeric: 'tabular-nums',
                              color: 'var(--amber)', letterSpacing: '0.05em'
                            }}>
                              *–*
                            </span>
                          ) : (
                            <span className="pred-note" style={{ fontStyle: 'italic' }}>
                              girmedi
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Maç başlayınca: herkesin tahmini */}
                {started && (
                  <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10 }}>
                    {others.length === 0 && (
                      <div className="pred-note">Bu maça kimse tahmin girmemiş.</div>
                    )}
                    {others.map((o) => (
                      <div key={o.userId} style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', padding: '4px 0', fontSize: 13
                      }}>
                        <span style={{
                          color: o.userId === userId ? 'var(--amber)' : 'var(--chalk)',
                          fontWeight: o.userId === userId ? 700 : 400
                        }}>
                          {o.username}{o.userId === userId ? ' (sen)' : ''}
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-display)',
                          fontVariantNumeric: 'tabular-nums', display: 'flex',
                          alignItems: 'center', gap: 10
                        }}>
                          {o.h}–{o.a}
                          {finished && o.points != null && (
                            <span className={`points p${o.points}`}>{pointsLabel(o.points)}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

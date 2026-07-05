'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { getActiveGroupId } from '../lib/group';

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
  if (p === 3) return 'Gol farkı +3';
  if (p === 2) return 'Doğru sonuç +2';
  return '0 puan';
}

// ── Ön analiz: form + Poisson modeli ──
function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function poisson(l, k) { return Math.exp(-l) * Math.pow(l, k) / factorial(k); }

function computeAnalysis(match, matches) {
  const finished = matches.filter((x) =>
    x.status === 'FINISHED' && x.home_score != null && x.away_score != null);

  const teamStats = (team) => {
    const ms = finished
      .filter((x) => x.home_team === team || x.away_team === team)
      .sort((a, b) => new Date(b.utc_date) - new Date(a.utc_date));
    let gf = 0, ga = 0;
    const form = [];
    for (const x of ms) {
      const isHome = x.home_team === team;
      const f = isHome ? x.home_score : x.away_score;
      const g = isHome ? x.away_score : x.home_score;
      gf += f; ga += g;
      if (form.length < 5) form.push(f > g ? 'G' : f < g ? 'M' : 'B');
    }
    return {
      played: ms.length,
      avgF: ms.length ? gf / ms.length : 0,
      avgA: ms.length ? ga / ms.length : 0,
      form
    };
  };

  const home = teamStats(match.home_team);
  const away = teamStats(match.away_team);
  if (!home.played || !away.played) return { insufficient: true, home, away };

  // Turnuva geneli gol ortalaması (takım başına)
  let tg = 0;
  for (const x of finished) tg += x.home_score + x.away_score;
  const leagueAvg = tg / (2 * finished.length) || 1.3;

  // Beklenen gol: hücum gücü × rakibin savunma zaafı
  const clamp = (v) => Math.max(0.2, Math.min(4, v || 0.8));
  const lh = clamp((home.avgF * away.avgA) / leagueAvg);
  const la = clamp((away.avgF * home.avgA) / leagueAvg);

  // 0-6 gol aralığında skor olasılık matrisi
  let pH = 0, pD = 0, pA = 0, total = 0;
  const scores = [];
  for (let h = 0; h <= 6; h++) {
    for (let g = 0; g <= 6; g++) {
      const pr = poisson(lh, h) * poisson(la, g);
      total += pr;
      scores.push({ h, a: g, p: pr });
      if (h > g) pH += pr; else if (h === g) pD += pr; else pA += pr;
    }
  }
  const ph = Math.round((pH / total) * 100);
  const pd = Math.round((pD / total) * 100);
  const top = scores.sort((x, y) => y.p - x.p).slice(0, 3)
    .map((s) => ({ h: s.h, a: s.a, p: Math.round((s.p / total) * 100) }));

  return { pH: ph, pD: pd, pA: 100 - ph - pd, top, home, away };
}

export default function Home() {
  const [userId, setUserId] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [preds, setPreds] = useState({});      // benim tahminlerim
  const [allPreds, setAllPreds] = useState({}); // başlamış maçlarda herkesin tahmini
  const [flags, setFlags] = useState({});       // match_id -> Set(user_id): kim tahmin girdi
  const [players, setPlayers] = useState([]);   // tüm oyuncular [{id, username}]
  const [drafts, setDrafts] = useState({});
  const [savedFlash, setSavedFlash] = useState({});
  const [h2h, setH2h] = useState({}); // match_id -> 'loading' | 'error' | {agg, list}
  const [analysis, setAnalysis] = useState({}); // match_id -> analiz sonucu
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/giris'); return; }
      setUserId(session.user.id);

      const gid = getActiveGroupId();
      if (!gid) { router.push('/gruplar'); return; }
      setGroupId(gid);
      const { data: grp } = await supabase.from('groups')
        .select('competition_code').eq('id', gid).single();
      const comp = grp?.competition_code || 'WC';


      fetch('/api/sync').catch(() => {});

      const [{ data: ms }, { data: myPs }, { data: everyPs }, { data: profiles }, { data: fl }] =
        await Promise.all([
          supabase.from('matches').select('*')
            .eq('competition_code', comp).order('utc_date'),
          supabase.from('predictions')
            .select('match_id, home_pred, away_pred, points')
            .eq('user_id', session.user.id).eq('group_id', gid),
          supabase.from('predictions')
            .select('match_id, user_id, home_pred, away_pred, points')
            .eq('group_id', gid),
          supabase.from('group_members')
            .select('user_id, profiles(username)').eq('group_id', gid),
          supabase.from('prediction_flags')
            .select('match_id, user_id').eq('group_id', gid)
        ]);

      setMatches(ms || []);
      setPreds(Object.fromEntries((myPs || []).map((p) => [p.match_id, p])));

      const sortedPlayers = (profiles || [])
        .map((r) => ({ id: r.user_id, username: r.profiles?.username || '???' }))
        .sort((a, b) => a.username.localeCompare(b.username));
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
      { user_id: userId, group_id: groupId, match_id: match.id,
        home_pred: h, away_pred: a, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,match_id,group_id' }
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

  async function toggleH2h(m) {
    if (h2h[m.id]) {
      setH2h((s) => { const n = { ...s }; delete n[m.id]; return n; });
      return;
    }
    setH2h((s) => ({ ...s, [m.id]: 'loading' }));
    try {
      const r = await fetch(`/api/h2h?match=${m.id}`);
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error();
      setH2h((s) => ({ ...s, [m.id]: { agg: j.agg, list: j.list } }));
    } catch {
      setH2h((s) => ({ ...s, [m.id]: 'error' }));
    }
  }

  function toggleAnaliz(m) {
    if (analysis[m.id]) {
      setAnalysis((s) => { const n = { ...s }; delete n[m.id]; return n; });
      return;
    }
    setAnalysis((s) => ({ ...s, [m.id]: computeAnalysis(m, matches) }));
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
                  <span>
                    {m.group_name || m.stage?.replaceAll('_', ' ') || ''}
                    {!finished && (
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(
                          `${m.home_team} ${m.away_team} muhtemel ilk 11`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: 10, color: 'var(--amber)', opacity: 0.85 }}
                      >
                        Kadrolar ↗
                      </a>
                    )}
                    {m.home_team !== 'Belirlenecek' && m.away_team !== 'Belirlenecek' && (
                      <a onClick={() => toggleH2h(m)}
                         style={{ marginLeft: 10, color: 'var(--amber)', opacity: 0.85,
                                  cursor: 'pointer' }}>
                        Geçmiş ⚔
                      </a>
                    )}
                    {!started && m.home_team !== 'Belirlenecek' &&
                     m.away_team !== 'Belirlenecek' && (
                      <a onClick={() => toggleAnaliz(m)}
                         style={{ marginLeft: 10, color: 'var(--amber)', opacity: 0.85,
                                  cursor: 'pointer' }}>
                        Analiz 🔮
                      </a>
                    )}
                  </span>
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

                {/* Head-to-head paneli */}
                {h2h[m.id] && (
                  <div style={{ borderTop: '1px solid var(--line)', marginTop: 10,
                                paddingTop: 10, fontSize: 13 }}>
                    {h2h[m.id] === 'loading' && (
                      <div className="pred-note">Geçmiş karşılaşmalar yükleniyor…</div>
                    )}
                    {h2h[m.id] === 'error' && (
                      <div className="pred-note">Geçmiş verisi alınamadı.</div>
                    )}
                    {typeof h2h[m.id] === 'object' && (
                      <>
                        {h2h[m.id].agg && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                              Son {h2h[m.id].agg.matches} karşılaşma:
                            </span>{' '}
                            {m.home_team} {h2h[m.id].agg.homeWins}G ·{' '}
                            {h2h[m.id].agg.draws}B · {m.away_team} {h2h[m.id].agg.awayWins}G
                          </div>
                        )}
                        {(h2h[m.id].list || []).map((g, j) => (
                          <div key={j} className="pred-note" style={{ padding: '2px 0' }}>
                            {g.date} — {g.home} <span style={{
                              fontFamily: 'var(--font-display)', color: 'var(--chalk)'
                            }}>{g.hs}–{g.as}</span> {g.away}
                          </div>
                        ))}
                        {(h2h[m.id].list || []).length === 0 && (
                          <div className="pred-note">
                            Bu iki takım yakın geçmişte karşılaşmamış.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Ön analiz paneli */}
                {!started && analysis[m.id] && (
                  <div style={{ borderTop: '1px solid var(--line)', marginTop: 10,
                                paddingTop: 10, fontSize: 13 }}>
                    {analysis[m.id].insufficient ? (
                      <div className="pred-note">
                        Analiz için yeterli veri yok — iki takımın da bu turnuvada
                        bitmiş maçı olması gerekiyor.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                                      fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                            {m.home_team} %{analysis[m.id].pH}
                          </span>
                          <span className="pred-note">
                            Beraberlik %{analysis[m.id].pD}
                          </span>
                          <span style={{ color: 'var(--chalk)', fontWeight: 600 }}>
                            %{analysis[m.id].pA} {m.away_team}
                          </span>
                        </div>
                        <div style={{ display: 'flex', height: 8, borderRadius: 4,
                                      overflow: 'hidden', marginBottom: 10,
                                      border: '1px solid var(--line)' }}>
                          <div style={{ width: `${analysis[m.id].pH}%`,
                                        background: 'var(--amber)' }} />
                          <div style={{ width: `${analysis[m.id].pD}%`,
                                        background: 'var(--pitch-3)' }} />
                          <div style={{ width: `${analysis[m.id].pA}%`,
                                        background: 'var(--muted)' }} />
                        </div>

                        <div style={{ marginBottom: 8 }}>
                          <span className="pred-note">En olası skorlar: </span>
                          {analysis[m.id].top.map((s, j) => (
                            <span key={j} style={{
                              fontFamily: 'var(--font-display)', color: 'var(--amber)',
                              marginRight: 12
                            }}>
                              {s.h}–{s.a}{' '}
                              <span className="pred-note">%{s.p}</span>
                            </span>
                          ))}
                        </div>

                        {[['home', m.home_team], ['away', m.away_team]].map(([side, name]) => {
                          const st = analysis[m.id][side];
                          return (
                            <div key={side} style={{ display: 'flex', alignItems: 'center',
                                                     gap: 8, padding: '2px 0' }}>
                              <span style={{ width: 130, overflow: 'hidden',
                                             textOverflow: 'ellipsis',
                                             whiteSpace: 'nowrap', fontSize: 12.5 }}>
                                {name}
                              </span>
                              <span title="Son maçlar (en yeni solda)">
                                {st.form.map((f, j) => (
                                  <span key={j} style={{
                                    display: 'inline-block', width: 16, textAlign: 'center',
                                    fontFamily: 'var(--font-display)', fontSize: 11.5,
                                    color: f === 'G' ? 'var(--amber)'
                                         : f === 'B' ? 'var(--muted)' : 'var(--danger)'
                                  }}>{f}</span>
                                ))}
                              </span>
                              <span className="pred-note">
                                maç başı {st.avgF.toFixed(1)} attı · {st.avgA.toFixed(1)} yedi
                              </span>
                            </div>
                          );
                        })}
                        <div className="pred-note" style={{ marginTop: 8, fontStyle: 'italic' }}>
                          Bu turnuvadaki sonuçlara dayalı istatistiksel tahmindir; garanti değildir. 🔮
                        </div>
                      </>
                    )}
                  </div>
                )}

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

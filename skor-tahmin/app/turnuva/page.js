'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { getActiveGroupId } from '../../lib/group';

const KO_STAGES = [
  ['LAST_32', 'Son 32'],
  ['LAST_16', 'Son 16'],
  ['QUARTER_FINALS', 'Çeyrek Final'],
  ['SEMI_FINALS', 'Yarı Final'],
  ['THIRD_PLACE', "3.'lük Maçı"],
  ['FINAL', 'Final']
];
const POS_TR = {
  Goalkeeper: 'Kaleci', Defence: 'Defans', Defender: 'Defans',
  Midfield: 'Orta Saha', Midfielder: 'Orta Saha',
  Offence: 'Forvet', Attacker: 'Forvet', Forward: 'Forvet'
};
const TABS = [
  ['agac', 'Kupa Ağacı'], ['gruplar', 'Gruplar'],
  ['golkrali', 'Gol Krallığı'], ['takimlar', 'Takımlar']
];

function norm(s) {
  return (s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function tabStyle(active) {
  return {
    padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
    fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
    border: `1px solid ${active ? 'var(--amber-dim)' : 'var(--line)'}`,
    background: active ? 'var(--pitch-3)' : 'transparent',
    color: active ? 'var(--amber)' : 'var(--muted)', userSelect: 'none'
  };
}

export default function TurnuvaPage() {
  const [tab, setTab] = useState('agac');
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [scorerPicks, setScorerPicks] = useState([]); // [{username, pick}]
  const [openTeam, setOpenTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/giris'); return; }

      const gid = getActiveGroupId();
      if (!gid) { router.push('/gruplar'); return; }
      const { data: grp } = await supabase.from('groups')
        .select('competition_code').eq('id', gid).single();
      const comp = grp?.competition_code || 'WC';


      fetch('/api/sync').catch(() => {});

      const [{ data: ms }, { data: td }, { data: bonuses }, { data: profiles }] =
        await Promise.all([
          supabase.from('matches').select('*')
            .eq('competition_code', comp).order('utc_date'),
          supabase.from('tournament_data')
            .select('key, data').eq('competition_code', comp),
          supabase.from('bonus_predictions')
            .select('user_id, top_scorer').eq('group_id', gid),
          supabase.from('profiles').select('id, username')
        ]);

      setMatches(ms || []);
      const byKey = Object.fromEntries((td || []).map((r) => [r.key, r.data]));
      setStandings(byKey.standings || []);
      setScorers(byKey.scorers || []);
      setTeams((byKey.teams || []).slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')));

      const names = Object.fromEntries((profiles || []).map((p) => [p.id, p.username]));
      setScorerPicks((bonuses || [])
        .filter((b) => b.top_scorer)
        .map((b) => ({ username: names[b.user_id] || '???', pick: b.top_scorer })));

      setLoading(false);
    })();
  }, [router]);

  const koColumns = useMemo(() => {
    return KO_STAGES.map(([stage, label]) => ({
      stage, label,
      matches: matches.filter((m) => m.stage === stage)
        .sort((a, b) => new Date(a.utc_date) - new Date(b.utc_date))
    })).filter((c) => c.matches.length > 0);
  }, [matches]);

  if (loading) return <div className="empty">Yükleniyor…</div>;

  return (
    <>
      <div className="day-header">Turnuva</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {TABS.map(([id, label]) => (
          <span key={id} style={tabStyle(tab === id)} onClick={() => setTab(id)}>
            {label}
          </span>
        ))}
      </div>

      {/* ── KUPA AĞACI ─────────────────────────── */}
      {tab === 'agac' && (
        koColumns.length === 0
          ? <div className="empty">Eleme turu maçları henüz fikstürde görünmüyor.</div>
          : (
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto',
                          paddingBottom: 12, alignItems: 'flex-start' }}>
              {koColumns.map((col) => (
                <div key={col.stage} style={{ minWidth: 210, flexShrink: 0 }}>
                  <div className="day-header" style={{ margin: '0 0 10px' }}>{col.label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
                                justifyContent: 'space-around',
                                minHeight: '100%' }}>
                    {col.matches.map((m) => {
                      const done = m.status === 'FINISHED';
                      const homeWin = done && (m.winner === 'HOME_TEAM' ||
                        (!m.winner && m.home_score > m.away_score));
                      const awayWin = done && (m.winner === 'AWAY_TEAM' ||
                        (!m.winner && m.away_score > m.home_score));
                      const Row = ({ crest, name, score, win }) => (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                                      padding: '3px 0' }}>
                          {crest
                            ? <img src={crest} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                            : <span style={{ width: 16 }} />}
                          <span style={{
                            flex: 1, fontSize: 12, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            color: win ? 'var(--amber)' : 'var(--chalk)',
                            fontWeight: win ? 700 : 400,
                            opacity: name === 'Belirlenecek' ? 0.4 : 1
                          }}>{name}</span>
                          <span style={{
                            fontFamily: 'var(--font-display)', fontSize: 13,
                            fontVariantNumeric: 'tabular-nums',
                            color: win ? 'var(--amber)' : 'var(--muted)'
                          }}>{score ?? '–'}</span>
                        </div>
                      );
                      return (
                        <div key={m.id} style={{
                          background: 'var(--pitch-2)', border: '1px solid var(--line)',
                          borderRadius: 8, padding: '8px 10px'
                        }}>
                          <Row crest={m.home_crest} name={m.home_team}
                               score={m.home_score} win={homeWin} />
                          <Row crest={m.away_crest} name={m.away_team}
                               score={m.away_score} win={awayWin} />
                          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
                            {done ? 'Bitti' : new Date(m.utc_date).toLocaleDateString('tr-TR', {
                              day: 'numeric', month: 'short', hour: '2-digit',
                              minute: '2-digit', timeZone: 'Europe/Istanbul'
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
      )}

      {/* ── GRUPLAR ────────────────────────────── */}
      {tab === 'gruplar' && (
        standings.length === 0
          ? <div className="empty">Puan durumu verisi henüz senkronlanmadı.</div>
          : (
            <div style={{ display: 'grid', gap: 16,
                          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {standings.filter((s) => (s.type || 'TOTAL') === 'TOTAL').map((s) => (
                <div key={s.group} style={{
                  background: 'var(--pitch-2)', border: '1px solid var(--line)',
                  borderRadius: 10, padding: 12
                }}>
                  <div className="day-header" style={{ margin: '0 0 8px' }}>
                    {s.group ? s.group.replace('GROUP_', 'Grup ') : 'Puan Durumu'}
                  </div>
                  <table className="standings" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th className="rank">#</th><th>Takım</th>
                        <th className="num">O</th><th className="num">AV</th>
                        <th className="num">P</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(s.table || []).map((r) => (
                        <tr key={r.team?.id || r.position}>
                          <td className="rank">{r.position}</td>
                          <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {r.team?.crest &&
                              <img src={r.team.crest} alt=""
                                   style={{ width: 16, height: 16, objectFit: 'contain' }} />}
                            <span style={{ fontSize: 13 }}>{r.team?.name}</span>
                          </td>
                          <td className="num">{r.playedGames}</td>
                          <td className="num">{r.goalDifference > 0 ? '+' : ''}{r.goalDifference}</td>
                          <td className="num total" style={{ fontSize: 14 }}>{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )
      )}

      {/* ── GOL KRALLIĞI ───────────────────────── */}
      {tab === 'golkrali' && (
        scorers.length === 0
          ? <div className="empty">Gol krallığı verisi henüz senkronlanmadı.</div>
          : (
            <>
              {scorers.map((s, i) => {
                const fans = scorerPicks.filter((p) =>
                  norm(s.player?.name).includes(norm(p.pick)) ||
                  norm(p.pick).includes(norm(s.player?.name))
                );
                return (
                  <div key={s.player?.id || i} style={{
                    background: 'var(--pitch-2)', border: '1px solid var(--line)',
                    borderRadius: 8, padding: '10px 14px', marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 12
                  }}>
                    <span className="rank" style={{
                      fontFamily: 'var(--font-display)', width: 24,
                      color: i === 0 ? 'var(--amber)' : 'var(--muted)'
                    }}>{i + 1}</span>
                    {s.team?.crest &&
                      <img src={s.team.crest} alt=""
                           style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>{s.player?.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {s.team?.name}
                        {fans.length > 0 && (
                          <span style={{ color: 'var(--amber)', opacity: 0.85 }}>
                            {' '}· 🎯 {fans.map((f) => f.username).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="digit" style={{ width: 38, height: 38, fontSize: 17 }}>
                      {s.goals}
                    </span>
                  </div>
                );
              })}
              <p className="pred-note">
                🎯 = bu oyuncuyu bonus tahmininde gol kralı seçenler. Gol sayıları maç
                senkronuyla birlikte güncellenir.
              </p>
            </>
          )
      )}

      {/* ── TAKIMLAR ───────────────────────────── */}
      {tab === 'takimlar' && (
        teams.length === 0
          ? <div className="empty">Kadro verisi henüz senkronlanmadı.</div>
          : teams.map((t) => {
            const open = openTeam === t.id;
            const squad = t.squad || [];
            const groups = {};
            for (const pl of squad) {
              const k = POS_TR[pl.position] || pl.position || 'Diğer';
              if (!groups[k]) groups[k] = [];
              groups[k].push(pl);
            }
            return (
              <div key={t.id} style={{
                background: 'var(--pitch-2)', border: '1px solid var(--line)',
                borderRadius: 8, marginBottom: 8, overflow: 'hidden'
              }}>
                <div onClick={() => setOpenTeam(open ? null : t.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', cursor: 'pointer'
                }}>
                  {t.crest &&
                    <img src={t.crest} alt=""
                         style={{ width: 22, height: 22, objectFit: 'contain' }} />}
                  <span style={{ flex: 1, fontSize: 14 }}>{t.name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {open ? '▲' : '▼'}
                  </span>
                </div>
                {open && (
                  <div style={{ borderTop: '1px solid var(--line)', padding: '10px 14px' }}>
                    {t.coach?.name && (
                      <div className="pred-note" style={{ marginBottom: 8 }}>
                        Teknik direktör: {t.coach.name}
                      </div>
                    )}
                    {squad.length === 0
                      ? <div className="pred-note">Kadro verisi bulunamadı.</div>
                      : ['Kaleci', 'Defans', 'Orta Saha', 'Forvet', 'Diğer']
                          .filter((k) => groups[k]?.length)
                          .map((k) => (
                            <div key={k} style={{ marginBottom: 8 }}>
                              <div style={{
                                fontFamily: 'var(--font-display)', fontSize: 11,
                                letterSpacing: '0.1em', textTransform: 'uppercase',
                                color: 'var(--muted)', marginBottom: 4
                              }}>{k}</div>
                              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                                {groups[k].map((pl) => pl.name).join(' · ')}
                              </div>
                            </div>
                          ))}
                  </div>
                )}
              </div>
            );
          })
      )}
    </>
  );
}

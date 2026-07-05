'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { setActiveGroupId } from '../../lib/group';

export default function GruplarPage() {
  const [userId, setUserId] = useState(null);
  const [myGroups, setMyGroups] = useState([]);
  const [counts, setCounts] = useState({});
  const [comps, setComps] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [comp, setComp] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function load(uid) {
    const [{ data: gm }, { data: cs }] = await Promise.all([
      supabase.from('group_members')
        .select('group_id, groups(id, name, invite_code, owner_id, archived, competitions(code, name, emblem, type))')
        .eq('user_id', uid),
      supabase.from('competitions').select('*').order('name')
    ]);
    const groups = (gm || []).map((r) => r.groups).filter(Boolean)
      .sort((a, b) => (a.archived === b.archived ? 0 : a.archived ? 1 : -1));
    setMyGroups(groups);
    setComps(cs || []);
    if (!comp && cs?.length) setComp('WC');

    const ids = groups.map((g) => g.id);
    if (ids.length) {
      const { data: members } = await supabase
        .from('group_members').select('group_id').in('group_id', ids);
      const c = {};
      for (const m of members || []) c[m.group_id] = (c[m.group_id] || 0) + 1;
      setCounts(c);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/giris'); return; }
      setUserId(session.user.id);
      load(session.user.id);
    })();
  }, [router]);

  function openGroup(g) {
    setActiveGroupId(g.id);
    router.push('/');
  }

  async function createGroup() {
    setError('');
    const clean = name.trim();
    if (clean.length < 3) { setError('Grup adı en az 3 karakter olmalı.'); return; }
    if (!comp) { setError('Bir turnuva/lig seçin.'); return; }

    for (let attempt = 0; attempt < 2; attempt++) {
      const code = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
      const { data: g, error: e } = await supabase.from('groups')
        .insert({ name: clean, competition_code: comp, invite_code: code, owner_id: userId })
        .select('id').single();
      if (e) {
        if (e.code === '23505' && attempt === 0) continue; // kod çakıştı, yeniden dene
        setError('Grup kurulamadı: ' + e.message);
        return;
      }
      await supabase.from('group_members').insert({ group_id: g.id, user_id: userId });
      setActiveGroupId(g.id);
      router.push('/');
      return;
    }
  }

  async function joinGroup() {
    setError('');
    const code = joinCode.trim();
    if (!code) return;
    const { data, error: e } = await supabase.rpc('join_group', { code });
    if (e) { setError(e.message || 'Katılma başarısız.'); return; }
    setActiveGroupId(data);
    router.push('/');
  }

  function copyInvite(g) {
    const link = `${window.location.origin}/katil/${g.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(g.id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  if (loading) return <div className="empty">Yükleniyor…</div>;

  const inputStyle = {
    width: '100%', padding: 10, fontSize: 15, background: '#071a13',
    color: 'var(--chalk)', border: '1px solid var(--line)',
    borderRadius: 6, outline: 'none'
  };

  return (
    <>
      <div className="day-header">Gruplarım</div>

      {myGroups.length === 0 && (
        <div className="empty" style={{ padding: '24px 0' }}>
          Henüz bir grubun yok. Aşağıdan yeni grup kur veya davet koduyla katıl.
        </div>
      )}

      {myGroups.map((g) => (
        <div key={g.id} className="match" style={{
          display: 'flex', alignItems: 'center', gap: 14,
          opacity: g.archived ? 0.55 : 1
        }}>
          {g.competitions?.emblem && (
            <img src={g.competitions.emblem} alt=""
                 style={{ width: 40, height: 40, objectFit: 'contain' }}
                 onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          )}
          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
               onClick={() => !g.archived && openGroup(g)}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--chalk)' }}>
              {g.name}
              {g.owner_id === userId && (
                <span title="Grup yöneticisisin" style={{ marginLeft: 6 }}>👑</span>
              )}
              {g.archived && (
                <span className="pred-note" style={{ marginLeft: 8 }}>(arşivlendi)</span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
              {g.competitions?.name} · {counts[g.id] || 1} üye
            </div>
          </div>
          <button className="save" style={{ padding: '7px 12px' }}
                  onClick={() => copyInvite(g)}>
            {copied === g.id ? 'Kopyalandı ✓' : 'Davet linki'}
          </button>
          <button className="save" title="Grup ayarları" style={{
                    padding: '7px 12px', background: 'transparent',
                    border: '1px solid var(--line)', color: 'var(--muted)'
                  }}
                  onClick={() => router.push(`/grup/${g.id}`)}>
            ⚙
          </button>
          {!g.archived && (
            <button className="save" style={{ padding: '7px 14px' }}
                    onClick={() => openGroup(g)}>
              Aç →
            </button>
          )}
        </div>
      ))}

      <div className="day-header" style={{ marginTop: 28 }}>Davet koduyla katıl</div>
      <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
        <input style={inputStyle} value={joinCode}
               onChange={(e) => setJoinCode(e.target.value)}
               placeholder="örn. x7k2p9"
               onKeyDown={(e) => e.key === 'Enter' && joinGroup()} />
        <button className="save" style={{ padding: '10px 18px' }} onClick={joinGroup}>
          Katıl
        </button>
      </div>

      <div className="day-header" style={{ marginTop: 28 }}>Yeni grup kur</div>
      {!showCreate ? (
        <button className="save" style={{ padding: '10px 18px' }}
                onClick={() => setShowCreate(true)}>
          + Grup kur
        </button>
      ) : (
        <div className="match" style={{ maxWidth: 460 }}>
          <label className="pred-note">Grup adı</label>
          <input style={{ ...inputStyle, margin: '4px 0 14px' }} value={name}
                 maxLength={40} placeholder="örn. Mahalle Ligi"
                 onChange={(e) => setName(e.target.value)} />

          <label className="pred-note">Turnuva / Lig (sonradan değiştirilemez)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '6px 0 14px' }}>
            {comps.map((c) => (
              <span key={c.code} onClick={() => setComp(c.code)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 8, fontSize: 12.5,
                cursor: 'pointer', userSelect: 'none',
                border: `1px solid ${comp === c.code ? 'var(--amber-dim)' : 'var(--line)'}`,
                background: comp === c.code ? 'var(--pitch-3)' : 'transparent',
                color: comp === c.code ? 'var(--amber)' : 'var(--chalk)'
              }}>
                {c.emblem && (
                  <img src={c.emblem} alt=""
                       style={{ width: 16, height: 16, objectFit: 'contain' }}
                       onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                )}
                {c.name}
              </span>
            ))}
          </div>

          {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
          <button className="save" style={{ padding: '10px 18px' }} onClick={createGroup}>
            Grubu kur
          </button>
        </div>
      )}
      {error && !showCreate && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
    </>
  );
}

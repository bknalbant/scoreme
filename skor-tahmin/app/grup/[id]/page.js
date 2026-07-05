'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { getActiveGroupId, setActiveGroupId } from '../../../lib/group';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul'
  });
}

export default function GrupDetayPage() {
  const { id } = useParams();
  const [myId, setMyId] = useState(null);
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/giris'); return; }
    setMyId(session.user.id);

    const { data: g } = await supabase.from('groups')
      .select('id, name, invite_code, owner_id, archived, created_at, competitions(name, emblem, type)')
      .eq('id', id).maybeSingle();
    if (!g) { setNotFound(true); return; }
    setGroup(g);

    const { data: ms } = await supabase.from('group_members')
      .select('user_id, joined_at, profiles(username)')
      .eq('group_id', id).order('joined_at');
    setMembers(ms || []);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  if (notFound) {
    return (
      <div className="empty">
        Grup bulunamadı veya erişimin yok.
        <div style={{ marginTop: 14 }}>
          <button className="save" onClick={() => router.push('/gruplar')}>
            Gruplarıma dön
          </button>
        </div>
      </div>
    );
  }
  if (!group) return <div className="empty">Yükleniyor…</div>;

  const isOwner = myId === group.owner_id;

  function copyInvite() {
    const link = `${window.location.origin}/katil/${group.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function toggleArchive() {
    setBusy(true); setError('');
    const { error: e } = await supabase.from('groups')
      .update({ archived: !group.archived }).eq('id', group.id);
    if (e) setError(e.message); else await load();
    setBusy(false);
  }

  async function removeMember(m) {
    const name = m.profiles?.username || 'Bu üye';
    if (!window.confirm(
      `${name} gruptan çıkarılsın mı?\nBu gruptaki tüm tahminleri ve puanları da silinir.`
    )) return;
    setError('');
    const { error: e } = await supabase.rpc('remove_member', {
      gid: group.id, uid: m.user_id
    });
    if (e) setError(e.message); else await load();
  }

  async function leaveGroup() {
    if (!window.confirm(
      'Gruptan ayrılmak istediğine emin misin?\nTahminlerin silinmez — davet koduyla geri dönersen kaldığın yerden devam edersin.'
    )) return;
    setError('');
    const { error: e } = await supabase.from('group_members')
      .delete().eq('group_id', group.id).eq('user_id', myId);
    if (e) { setError(e.message); return; }
    if (getActiveGroupId() === group.id) setActiveGroupId(null);
    router.push('/gruplar');
  }

  async function deleteGroup() {
    const check = window.prompt(
      `Bu işlem GERİ ALINAMAZ: grup, tüm üyelikler, tahminler ve puanlar kalıcı olarak silinir.\n\nOnaylamak için grup adını aynen yaz:\n${group.name}`
    );
    if (check === null) return;
    if (check !== group.name) {
      setError('Grup adı eşleşmedi, silme iptal edildi.');
      return;
    }
    const { error: e } = await supabase.from('groups').delete().eq('id', group.id);
    if (e) { setError(e.message); return; }
    if (getActiveGroupId() === group.id) setActiveGroupId(null);
    router.push('/gruplar');
  }

  return (
    <>
      <div className="day-header">Grup ayarları</div>

      {/* Grup kimliği */}
      <div className="match" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {group.competitions?.emblem && (
          <img src={group.competitions.emblem} alt=""
               style={{ width: 44, height: 44, objectFit: 'contain' }}
               onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--chalk)' }}>
            {group.name}
            {group.archived && (
              <span className="pred-note" style={{ marginLeft: 8 }}>(arşivlendi)</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
            {group.competitions?.name} · {members.length} üye · {fmtDate(group.created_at)} tarihinde kuruldu
          </div>
        </div>
      </div>

      {/* Davet */}
      <div className="day-header">Davet</div>
      <div className="match" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          fontFamily: 'var(--font-display)', letterSpacing: '0.12em',
          fontSize: 15, color: 'var(--amber)'
        }}>{group.invite_code}</span>
        <span className="pred-note" style={{ flex: 1 }}>
          Kod süresizdir; linki paylaşan herkes davet edebilir.
        </span>
        <button className="save" style={{ padding: '7px 14px' }} onClick={copyInvite}>
          {copied ? 'Kopyalandı ✓' : 'Davet linkini kopyala'}
        </button>
      </div>

      {/* Üyeler */}
      <div className="day-header">Üyeler ({members.length})</div>
      {members.map((m) => (
        <div key={m.user_id} className="match" style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px'
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              fontSize: 14,
              color: m.user_id === myId ? 'var(--amber)' : 'var(--chalk)',
              fontWeight: m.user_id === myId ? 700 : 400
            }}>
              {m.profiles?.username || '???'}
              {m.user_id === group.owner_id && (
                <span title="Grup yöneticisi" style={{ marginLeft: 6 }}>👑</span>
              )}
              {m.user_id === myId ? ' (sen)' : ''}
            </span>
            <span className="pred-note" style={{ marginLeft: 10 }}>
              {fmtDate(m.joined_at)}
            </span>
          </div>
          {isOwner && m.user_id !== myId && (
            <button className="save" style={{
              padding: '6px 12px', background: 'transparent',
              border: '1px solid var(--danger)', color: 'var(--danger)'
            }} onClick={() => removeMember(m)}>
              Çıkar
            </button>
          )}
        </div>
      ))}

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {/* İşlemler */}
      <div className="day-header" style={{ marginTop: 28 }}>
        {isOwner ? 'Yönetici işlemleri' : 'Üyelik'}
      </div>

      {!isOwner && (
        <button className="save" style={{
          padding: '10px 18px', background: 'transparent',
          border: '1px solid var(--danger)', color: 'var(--danger)'
        }} onClick={leaveGroup}>
          Gruptan ayrıl
        </button>
      )}

      {isOwner && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button className="save" style={{ padding: '10px 18px' }}
                  disabled={busy} onClick={toggleArchive}>
            {group.archived ? 'Arşivden çıkar' : 'Grubu arşivle'}
          </button>
          <button className="save" style={{
            padding: '10px 18px', background: 'transparent',
            border: '1px solid var(--danger)', color: 'var(--danger)'
          }} onClick={deleteGroup}>
            Grubu kalıcı olarak sil
          </button>
        </div>
      )}
      {isOwner && (
        <p className="pred-note" style={{ marginTop: 12 }}>
          Arşivleme: grup salt-okunur olur, tablo ve tahminler anı olarak korunur;
          istediğin zaman geri açabilirsin. Silme: her şey kalıcı olarak gider —
          onay için grup adını yazman istenir.
        </p>
      )}
    </>
  );
}

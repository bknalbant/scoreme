'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { getActiveGroupId } from '../lib/group';

const BASE_LINKS = [
  { href: '/gruplar', label: 'Gruplarım', icon: '👥' },
  { href: '/kurallar', label: 'Oyun Kuralları', icon: '📜' }
];
const GROUP_LINKS = [
  { href: '/', label: 'Maçlar', icon: '⚽' },
  { href: '/bonus', label: 'Bonus', icon: '🏆', cupOnly: true },
  { href: '/tablo', label: 'Puan Tablosu', icon: '📊' },
  { href: '/turnuva', label: 'Turnuva', icon: '🏟️' },
  { href: '/istatistik', label: 'İstatistikler', icon: '📈' }
];

export default function Nav() {
  const [username, setUsername] = useState(null);
  const [group, setGroup] = useState(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const loadGroup = useCallback(async () => {
    const gid = getActiveGroupId();
    if (!gid) { setGroup(null); return; }
    const { data } = await supabase
      .from('groups')
      .select('id, name, archived, competitions(name, emblem, type)')
      .eq('id', gid).maybeSingle();
    setGroup(data || null);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (mounted) { setUsername(null); setGroup(null); } return; }
      const { data } = await supabase
        .from('profiles').select('username').eq('id', session.user.id).single();
      if (mounted) setUsername(data?.username || session.user.email);
      loadGroup();
    }
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    const onGroupChange = () => loadGroup();
    window.addEventListener('groupchange', onGroupChange);
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      window.removeEventListener('groupchange', onGroupChange);
    };
  }, [loadGroup]);

  useEffect(() => { setOpen(false); loadGroup(); }, [pathname, loadGroup]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    setOpen(false);
    router.push('/giris');
  }

  const isCup = group?.competitions?.type === 'CUP';
  const links = group
    ? [...GROUP_LINKS.filter((l) => !l.cupOnly || isCup), ...BASE_LINKS]
    : BASE_LINKS;

  return (
    <>
      <style>{`
        .drawer-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          opacity: 0; pointer-events: none; transition: opacity .25s; z-index: 40;
        }
        .drawer-backdrop.show { opacity: 1; pointer-events: auto; }
        .drawer {
          position: fixed; top: 0; left: 0; bottom: 0; width: 250px;
          background: var(--pitch-2); border-right: 1px solid var(--line);
          transform: translateX(-100%); transition: transform .25s ease; z-index: 50;
          display: flex; flex-direction: column; padding: 18px 14px;
        }
        .drawer.show { transform: translateX(0); }
        .drawer .brand {
          font-family: var(--font-display), sans-serif; font-weight: 700;
          font-size: 17px; letter-spacing: .06em; text-transform: uppercase;
          color: var(--amber); margin: 4px 6px 16px;
        }
        .drawer a.item {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 12px; border-radius: 8px; font-size: 15px;
          color: var(--muted); margin-bottom: 4px;
        }
        .drawer a.item:hover { background: var(--pitch-3); color: var(--chalk); }
        .drawer a.item.active {
          background: var(--pitch-3); color: var(--amber);
          border-left: 3px solid var(--amber); padding-left: 9px;
        }
        .drawer .bottom {
          margin-top: auto; border-top: 1px solid var(--line); padding-top: 14px;
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
        }
        .hamburger {
          background: none; border: 1px solid var(--line); color: var(--chalk);
          border-radius: 8px; width: 38px; height: 38px; cursor: pointer;
          font-size: 17px; display: flex; align-items: center; justify-content: center;
        }
        .hamburger:hover { border-color: var(--amber-dim); color: var(--amber); }
        .group-chip {
          display: flex; align-items: center; gap: 8px; margin: 0 2px 16px;
          padding: 8px 10px; background: var(--pitch-3);
          border: 1px solid var(--line); border-radius: 8px;
        }
      `}</style>

      <nav className="nav">
        <button className="hamburger" aria-label="Menüyü aç" onClick={() => setOpen(true)}>☰</button>
        <span className="brand">Skor Tahmin</span>
        {group && (
          <span className="user" style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 180
          }}>· {group.name}</span>
        )}
        <div className="spacer" />
        {username && <span className="user">{username}</span>}
      </nav>

      <div className={`drawer-backdrop ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`drawer ${open ? 'show' : ''}`}>
        <span className="brand">Skor Tahmin</span>

        {group && (
          <div className="group-chip">
            {group.competitions?.emblem && (
              <img src={group.competitions.emblem} alt=""
                   style={{ width: 22, height: 22, objectFit: 'contain' }}
                   onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, color: 'var(--chalk)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>{group.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {group.competitions?.name}
              </div>
            </div>
            <Link href="/gruplar" style={{ fontSize: 11, color: 'var(--amber)' }}>
              değiştir
            </Link>
          </div>
        )}

        {links.map((l) => (
          <Link key={l.href} href={l.href}
                className={`item ${pathname === l.href ? 'active' : ''}`}>
            <span>{l.icon}</span> {l.label}
          </Link>
        ))}
        {username && (
          <div className="bottom">
            <span className="user">{username}</span>
            <button onClick={logout}>Çıkış</button>
          </div>
        )}
      </aside>
    </>
  );
}

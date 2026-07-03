'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

const LINKS = [
  { href: '/', label: 'Maçlar', icon: '⚽' },
  { href: '/bonus', label: 'Bonus', icon: '🏆' },
  { href: '/tablo', label: 'Puan Tablosu', icon: '📊' }
];

export default function Nav() {
  const [username, setUsername] = useState(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (mounted) setUsername(null); return; }
      const { data } = await supabase
        .from('profiles').select('username').eq('id', session.user.id).single();
      if (mounted) setUsername(data?.username || session.user.email);
    }
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // Sayfa değişince menüyü kapat
  useEffect(() => { setOpen(false); }, [pathname]);

  // Escape ile kapat
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
          color: var(--amber); margin: 4px 6px 22px;
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
      `}</style>

      {/* Üst bar: menü butonu + marka */}
      <nav className="nav">
        <button className="hamburger" aria-label="Menüyü aç" onClick={() => setOpen(true)}>☰</button>
        <span className="brand">Skor Tahmin</span>
        <div className="spacer" />
        {username && <span className="user">{username}</span>}
      </nav>

      {/* Karartma */}
      <div className={`drawer-backdrop ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />

      {/* Sol menü */}
      <aside className={`drawer ${open ? 'show' : ''}`}>
        <span className="brand">Skor Tahmin</span>
        {LINKS.map((l) => (
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

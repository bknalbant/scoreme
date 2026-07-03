'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function Nav() {
  const [username, setUsername] = useState(null);
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

  async function logout() {
    await supabase.auth.signOut();
    router.push('/giris');
  }

  return (
    <nav className="nav">
      <span className="brand">Skor Tahmin</span>
      <div className="links">
        <Link href="/" className={pathname === '/' ? 'active' : ''}>Maçlar</Link>
        <Link href="/bonus" className={pathname === '/bonus' ? 'active' : ''}>Bonus</Link>
        <Link href="/tablo" className={pathname === '/tablo' ? 'active' : ''}>Puan Tablosu</Link>
      </div>
      <div className="spacer" />
      {username && (
        <>
          <span className="user">{username}</span>
          <button onClick={logout}>Çıkış</button>
        </>
      )}
    </nav>
  );
}

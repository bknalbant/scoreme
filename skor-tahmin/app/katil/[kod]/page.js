'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { setActiveGroupId } from '../../../lib/group';

export default function KatilPage() {
  const { kod } = useParams();
  const [msg, setMsg] = useState('Davet kontrol ediliyor…');
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Önce üye ol / giriş yap, sonra otomatik geri dön
        router.push(`/giris?next=/katil/${kod}`);
        return;
      }
      const { data, error } = await supabase.rpc('join_group', { code: kod });
      if (error) {
        setFailed(true);
        setMsg(error.message || 'Davet kodu geçersiz veya grup kapatılmış.');
        return;
      }
      setActiveGroupId(data);
      setMsg('Gruba katıldın! Yönlendiriliyorsun…');
      router.push('/');
    })();
  }, [kod, router]);

  return (
    <div className="auth" style={{ textAlign: 'center' }}>
      <h1>Gruba katıl</h1>
      <p className="sub">{msg}</p>
      {failed && (
        <button className="save" style={{ padding: '10px 18px' }}
                onClick={() => router.push('/gruplar')}>
          Gruplarıma dön
        </button>
      )}
    </div>
  );
}

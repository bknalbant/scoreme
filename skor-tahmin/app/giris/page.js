'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';

function GirisInner() {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/gruplar';

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const clean = username.trim();
        if (clean.length < 3) throw new Error('Kullanıcı adı en az 3 karakter olmalı.');

        const { data: taken } = await supabase
          .from('profiles').select('id').eq('username', clean).maybeSingle();
        if (taken) throw new Error('Bu kullanıcı adı alınmış, başka bir tane seçin.');

        const { data, error: e1 } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: clean } }
        });
        if (e1) throw e1;
        if (data.user && !data.session) {
          throw new Error(
            'Hesap oluştu ama oturum açılamadı. E-posta onayı kapalı mı kontrol edin ' +
            've giriş yapmayı deneyin.'
          );
        }
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      }
      router.push(next);
    } catch (err) {
      setError(err.message || 'Bir şeyler ters gitti.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1>{mode === 'login' ? 'Giriş yap' : 'Kayıt ol'}</h1>
      <p className="sub">Skor tahmin oyunu</p>

      {mode === 'signup' && (
        <>
          <label>Kullanıcı adı (tabloda görünecek)</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)}
                 placeholder="örn. burak10" maxLength={20} />
        </>
      )}

      <label>E-posta</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
             placeholder="ornek@mail.com" />

      <label>Şifre</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
             placeholder="En az 6 karakter"
             onKeyDown={(e) => e.key === 'Enter' && submit()} />

      {error && <div className="error">{error}</div>}

      <button className="save" onClick={submit} disabled={busy}>
        {busy ? 'Bekleyin…' : mode === 'login' ? 'Giriş yap' : 'Kayıt ol'}
      </button>

      <div className="toggle">
        {mode === 'login' ? (
          <>Hesabın yok mu? <a onClick={() => setMode('signup')}>Kayıt ol</a></>
        ) : (
          <>Zaten hesabın var mı? <a onClick={() => setMode('login')}>Giriş yap</a></>
        )}
      </div>
    </div>
  );
}

export default function GirisPage() {
  return (
    <Suspense fallback={<div className="empty">Yükleniyor…</div>}>
      <GirisInner />
    </Suspense>
  );
}

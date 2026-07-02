'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function GirisPage() {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const clean = username.trim();
        if (clean.length < 3) throw new Error('Kullanıcı adı en az 3 karakter olmalı.');
        const { data, error: e1 } = await supabase.auth.signUp({ email, password });
        if (e1) throw e1;
        if (!data.user) throw new Error('Kayıt tamamlanamadı, tekrar deneyin.');
        const { error: e2 } = await supabase
          .from('profiles').insert({ id: data.user.id, username: clean });
        if (e2) {
          throw new Error(
            e2.code === '23505'
              ? 'Bu kullanıcı adı alınmış, başka bir tane seçin.'
              : e2.message
          );
        }
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      }
      router.push('/');
    } catch (err) {
      setError(err.message || 'Bir şeyler ters gitti.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1>{mode === 'login' ? 'Giriş yap' : 'Kayıt ol'}</h1>
      <p className="sub">Dünya Kupası 2026 skor tahmin oyunu</p>

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

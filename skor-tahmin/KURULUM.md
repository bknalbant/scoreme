# SKOR TAHMİN — Kurulum Rehberi

Dünya Kupası 2026 skor tahmin oyunu. Next.js + Supabase + football-data.org.

Puanlama: **tam skor 4 • doğru galibiyet 3 • doğru beraberlik 2 • yanlış 0**

Kurulum yaklaşık 30-45 dakika sürer. Sırayla gidin:

---

## 1) football-data.org API anahtarı (5 dk)

1. https://www.football-data.org/client/register adresinden ücretsiz kayıt olun.
2. E-postanıza gelen **API token**'ı bir kenara not edin.
   (Ücretsiz plan Dünya Kupası'nı kapsar, dakikada 10 istek yeterli.)

## 2) Supabase projesi (10 dk)

1. https://supabase.com → ücretsiz hesap açın → **New project** deyin.
2. Proje açılınca sol menüden **SQL Editor** → bu klasördeki
   `supabase/schema.sql` dosyasının içeriğini yapıştırın → **Run**.
3. **Authentication → Sign In / Providers → Email** bölümünde
   **"Confirm email" seçeneğini KAPATIN** (arkadaşlarınız e-posta onayı
   beklemeden kayıt olabilsin).
4. **Project Settings → API** sayfasından şu üç değeri not edin:
   - `Project URL`
   - `anon public` anahtarı
   - `service_role` anahtarı (GİZLİ — kimseyle paylaşmayın)

## 3) Kodu GitHub'a yükleyin (5 dk)

1. https://github.com → **New repository** (private seçebilirsiniz).
2. Bu klasörü repoya yükleyin (GitHub web arayüzünden "uploading an
   existing file" ile sürükle-bırak da olur).

## 4) Vercel'e deploy (10 dk)

1. https://vercel.com → GitHub ile giriş yapın → **Add New → Project**
   → az önceki repoyu seçin.
2. **Environment Variables** bölümüne şunları ekleyin:

   | İsim | Değer |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public anahtarı |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role anahtarı |
   | `FOOTBALL_DATA_TOKEN` | football-data.org token'ı |
   | `SYNC_SECRET` | Kendi uydurduğunuz uzun bir şifre |

3. **Deploy** deyin. 1-2 dakika sonra siteniz hazır:
   `https://PROJE-ADI.vercel.app`

## 5) İlk çalıştırma

1. Sitenizi açın, tarayıcıya şunu yazın (maçları ilk kez çeker):
   `https://SITENIZ.vercel.app/api/sync?secret=SYNC_SECRET_DEGERINIZ`
   → `{"ok":true,"matches":104,...}` gibi bir yanıt görmelisiniz.
2. Siteye dönün, **Kayıt ol** ile hesabınızı açın, tahmin girin.
3. Linki arkadaşlarınıza atın — herkes kendi hesabını açar.

---

## Nasıl çalışıyor?

- **Sonuç senkronu:** Site her açıldığında arka planda `/api/sync`
  tetiklenir; son senkron 10 dakikadan eskiyse football-data.org'dan
  sonuçlar çekilir ve puanlar otomatik hesaplanır. Ek olarak Vercel her
  gece 03:00'te (UTC) yedek senkron çalıştırır (`vercel.json`).
- **Kopya önlemi:** Tahminler maç başlayana kadar sadece sahibine
  görünür ve maç başladıktan sonra değiştirilemez (veritabanı
  seviyesinde, RLS ile korunur).
- **Skor kuralı:** Eleme maçlarında uzatmalar dahil "maç sonu" skoru
  esas alınır (football-data `fullTime`). 90 dakika kuralı isterseniz
  `app/api/sync/route.js` içinde düzenleyebiliriz.

## Yerelde denemek isterseniz (opsiyonel)

```bash
npm install
cp .env.local.example .env.local   # değerleri doldurun
npm run dev                         # http://localhost:3000
```

## Sık karşılaşılan sorunlar

- **"Bu kullanıcı adı alınmış"** → Başka kullanıcı adı seçin.
- **Kayıt sonrası giriş yapamıyorum** → Supabase'te "Confirm email"
  kapalı mı kontrol edin (Adım 2.3).
- **Maçlar görünmüyor** → Adım 5.1'deki sync linkini çalıştırın;
  `FOOTBALL_DATA_TOKEN` doğru mu bakın.
- **429 hatası** → football-data.org dakika limiti; birkaç dakika bekleyin.

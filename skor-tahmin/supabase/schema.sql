-- SKOR TAHMİN — Supabase şeması
-- Supabase panelinde SQL Editor'e yapıştırıp "Run" deyin.

-- 1) Kullanıcı profilleri (kullanıcı adları)
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "herkes profilleri okur" on public.profiles
  for select using (true);
create policy "kendi profilini ekler" on public.profiles
  for insert with check (auth.uid() = id);
create policy "kendi profilini gunceller" on public.profiles
  for update using (auth.uid() = id);

-- 2) Maçlar (football-data.org'dan otomatik senkronlanır)
create table public.matches (
  id bigint primary key,              -- football-data.org maç id'si
  utc_date timestamptz not null,      -- maç başlangıcı (UTC)
  status text not null,               -- TIMED / IN_PLAY / PAUSED / FINISHED ...
  stage text,
  group_name text,
  home_team text not null,
  away_team text not null,
  home_crest text,
  away_crest text,
  home_score int,
  away_score int,
  updated_at timestamptz default now()
);
alter table public.matches enable row level security;
create policy "herkes maclari okur" on public.matches
  for select using (true);
-- Yazma yetkisi yok: maçları yalnızca sunucu (service role) günceller.

-- 3) Tahminler
create table public.predictions (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id bigint not null references public.matches(id) on delete cascade,
  home_pred int not null check (home_pred between 0 and 20),
  away_pred int not null check (away_pred between 0 and 20),
  points int,                          -- maç bitince sunucu hesaplar (4/3/2/0)
  updated_at timestamptz default now(),
  unique (user_id, match_id)
);
alter table public.predictions enable row level security;

-- Kendi tahminini her zaman görür
create policy "kendi tahminini okur" on public.predictions
  for select using (auth.uid() = user_id);

-- Başkalarının tahminleri ancak maç BAŞLADIKTAN sonra görünür (kopya önlemi)
create policy "baslayan maclarin tahminleri herkese acik" on public.predictions
  for select using (
    exists (select 1 from public.matches m
            where m.id = match_id and m.utc_date <= now())
  );

-- Tahmin yalnızca maç başlamadan önce girilebilir / değiştirilebilir
create policy "baslamadan tahmin ekle" on public.predictions
  for insert with check (
    auth.uid() = user_id and
    exists (select 1 from public.matches m
            where m.id = match_id and m.utc_date > now())
  );
create policy "baslamadan tahmin guncelle" on public.predictions
  for update using (
    auth.uid() = user_id and
    exists (select 1 from public.matches m
            where m.id = match_id and m.utc_date > now())
  );

-- 4) Senkron durumu (API'ye çok sık gitmemek için)
create table public.sync_state (
  id int primary key default 1,
  last_synced_at timestamptz
);
insert into public.sync_state (id, last_synced_at) values (1, null);
alter table public.sync_state enable row level security;
create policy "senkron durumu okunur" on public.sync_state
  for select using (true);

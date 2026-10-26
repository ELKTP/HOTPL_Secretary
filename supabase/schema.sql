-- 핫플비서 DB 스키마: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

-- 공유/가져오기로 들어온 원본 (처리 상태 추적용)
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source text not null default 'web',      -- instagram | youtube | kakaomap | navermap | googlemap | web | text | image
  url text,
  shared_text text,
  extra_text text,                          -- 사용자가 나중에 보충한 본문
  status text not null default 'pending',   -- pending | done | no_place | needs_input | error
  note text,
  place_count int not null default 0,
  created_at timestamptz not null default now()
);

-- '가보고 싶은 곳' DB
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id uuid references public.items on delete set null,
  name text not null,
  category text,
  area text,
  address text,
  kind text not null default '상설',        -- 상설 | 팝업 | 전시 | 공연 | 페스티벌 | 행사
  start_date date,
  end_date date,
  period_status text not null default 'none', -- none | unverified | verified | not_found
  period_note text,
  period_source text,
  hours text,
  price text,
  tags text[] not null default '{}',
  good_for text[] not null default '{}',
  summary text,
  source_url text,
  sources text[] not null default '{}',     -- 합쳐진 모든 출처 링크
  save_count int not null default 1,
  status text not null default 'want',      -- want | visited | skip
  memo text,
  enriched_at timestamptz,                  -- 원본·웹 후기로 설명을 보강한 시각
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_user_created on public.items (user_id, created_at desc);
create index if not exists places_user_created on public.places (user_id, created_at desc);

-- 계정별 데이터 격리: 본인 행만 읽고 쓸 수 있음
alter table public.items enable row level security;
alter table public.places enable row level security;

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own places" on public.places;
create policy "own places" on public.places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.items, public.places to authenticated;

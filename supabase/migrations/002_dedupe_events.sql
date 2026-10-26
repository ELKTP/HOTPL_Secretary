-- 002: 중복 통합 · 행사 기간 검증 · 장소 설명 보강
-- 이미 schema.sql 로 만든 DB에 한 번 실행하세요 (Supabase > SQL Editor > Run). 여러 번 실행해도 안전합니다.

-- 합쳐진 장소의 모든 출처 링크
alter table public.places add column if not exists sources text[] not null default '{}';

-- 기간 한정 행사(팝업·전시·공연·페스티벌·행사)의 기간 확인 상태
--   none: 상설 장소 / unverified: 아직 확인 전 / verified: 웹에서 확인됨 / not_found: 확인 시도했으나 못 찾음
alter table public.places add column if not exists period_status text not null default 'none';
alter table public.places add column if not exists period_note text;     -- 운영 시간·회차·예약 등 일정 메모
alter table public.places add column if not exists period_source text;   -- 기간을 확인한 출처 URL

-- 원본 게시물·웹 후기로 설명을 보강한 시각 (null이면 '정리하기'에서 보강 대상)
alter table public.places add column if not exists enriched_at timestamptz;

update public.places set sources = array[source_url] where source_url is not null and sources = '{}';
update public.places set period_status = 'unverified' where kind <> '상설' and period_status = 'none';

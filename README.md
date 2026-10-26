# 핫플비서

SNS에서 스쳐 지나간 카페·팝업·핫플을 모아 두면, 약속이 생겼을 때 **지역·날짜·시간·목적·동행인**에 맞는 곳을 골라 주는 웹앱입니다.

- **계정별 DB**: 각자 가입해서 자기 장소만 쌓고, 자기 장소 중에서만 추천받습니다.
- **추천 (홈)**: 지역·날짜·시간·목적·동행인은 모두 선택 입력입니다. 날짜를 넣으면 그날 날씨 예보를 반영하고, 결과마다 장소 정보와 카카오맵·네이버지도·구글지도 링크를 보여줍니다.
- **취향 더하기**
  - 웹: 앱에서 링크 복사 → 붙여넣기 버튼, 또는 스크린샷 올리기
  - 안드로이드 (홈 화면에 추가했을 때): 인스타·유튜브·지도 앱에서 **공유 → 핫플비서**
- **처음 가져오기**: 처음 로그인하면 안내 창이 뜹니다. 카카오맵·네이버지도는 저장 목록 스크린샷, 구글지도·유튜브는 구글 테이크아웃 ZIP, 인스타그램은 '내 정보 내보내기' ZIP을 그대로 올리면 됩니다. 출처별 단계 안내가 앱 안에 있습니다.
- **장소 범위**: 음식점·카페·술집·상점·팝업·전시·관광지·체험공간·공원·레저시설·숙소 등 오프라인으로 방문할 수 있는 모든 곳
- **중복 없이 별표로**: 같은 장소를 또 저장하면 새 항목 대신 기존 장소에 별이 하나 늘고 출처 링크가 쌓입니다. 팝업·전시·공연·페스티벌 같은 기간 한정 행사는 내용과 기간이 모두 같을 때만 합칩니다.
- **장소 설명**: 게시물이 강조한 포인트, 댓글·후기 반응과 요즘 인기 이유, 대표 메뉴, 분위기를 2~4줄로 정리합니다. 행사는 웹에서 운영 기간을 확인해 카드 맨 위에 보여줍니다.
- **정리하기**: '내 장소'의 [정리하기]가 쌓인 중복을 합치고, 설명을 보강하고, 행사 기간을 확인합니다. 가져오기가 끝나면 자동으로 실행됩니다.
- **AI**: Claude Sonnet 5.5가 장소 추출·중복 판정·웹 조사·추천을 맡습니다.

## 구성

| 영역 | 사용 |
|---|---|
| 웹앱 (화면 + 서버 API) | Next.js 16 (TypeScript) + Tailwind CSS, Vercel 배포 |
| 로그인·DB | Supabase (이메일 로그인, Postgres, 행 단위 보안으로 계정별 분리) |
| AI | Claude API (`claude-sonnet-5-5`, 웹 검색 도구) |

```
src/app/            화면: 홈·추천(/), 취향 더하기(/add), 내 장소(/places), 가져오기(/import), 공유 수신(/share)
src/app/api/        서버 API: 저장·분석(/api/items), 재분석(/api/items/[id]/retry), 추천(/api/recommend)
src/lib/importers.ts  내보내기 파일(ZIP·CSV·JSON) 분석
src/lib/server/     링크 본문 가져오기(content), Claude 호출(claude), 장소 저장·중복 병합(process), 날씨(weather)
src/app/manifest.ts, public/sw.js   안드로이드 공유 메뉴 연동(PWA)
src/lib/server/dedupe.ts  같은 장소 판정·합치기
supabase/schema.sql DB 테이블·보안 정책 (새로 만들 때)
supabase/migrations/ 기존 DB에 추가로 실행할 변경 사항
```

## 배포하기

### 1. Supabase (DB·로그인)
1. [supabase.com](https://supabase.com)에서 가입한 뒤 **New project**를 만듭니다. 지역은 Seoul을 권장합니다.
2. **SQL Editor**에 [`supabase/schema.sql`](supabase/schema.sql) 내용을 붙여넣고 **Run**을 누릅니다.
   - 이미 예전 버전으로 DB를 만들었다면 [`supabase/migrations/002_dedupe_events.sql`](supabase/migrations/002_dedupe_events.sql)도 한 번 실행하세요.
3. **Authentication → Sign In / Providers → Email**에서 **Confirm email**을 끕니다. 그래야 가입 즉시 로그인됩니다.
4. **Project Settings → API Keys**에서 **Project URL**과 **Publishable key**(또는 anon key)를 복사해 둡니다.

### 2. Anthropic (Claude API 키)
1. [console.anthropic.com](https://console.anthropic.com)에서 **API Keys → Create Key**를 누르고 키를 복사해 둡니다.
2. **Billing**에서 크레딧을 충전합니다.
3. **Limits**에서 월 사용 한도를 걸어 둡니다(예: $5). URL이 공개되어 있어 누구나 가입할 수 있으므로, 비용이 그 이상 나가지 않게 막는 장치입니다.

### 3. GitHub에 올리기
[github.com/new](https://github.com/new)에서 빈 저장소를 만든 뒤(README 추가 없이), 이 폴더에서 아래 명령을 실행합니다.
```bash
git config --global user.name ""          # 처음 한 번만
git config --global user.email ""       # 처음 한 번만
git init -b main
git add .
git commit -m "핫플비서 첫 버전"
git remote add origin https://github.com/ELKTP/HOTPL_Secretary.git
git push -u origin main                          # 브라우저 로그인 창이 뜨면 GitHub 로그인
```

### 4. Vercel 배포
1. [vercel.com](https://vercel.com)에 GitHub 계정으로 로그인합니다.
2. **Add New → Project**에서 방금 만든 저장소를 **Import**합니다.
3. **Environment Variables**에 아래 3개를 입력합니다.

   | 이름 | 값 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable key (또는 anon key) |
   | `ANTHROPIC_API_KEY` | Anthropic API 키 |

4. **Deploy**를 누르면 `https://<프로젝트>.vercel.app` 주소가 발급됩니다. 이 URL을 공유하면 됩니다.

> 환경변수를 나중에 바꿨다면 **Deployments → Redeploy**를 눌러야 반영됩니다.

### 5. 휴대폰에서 쓰기 (안드로이드)
1. 크롬으로 URL에 접속해 가입합니다.
2. (선택) ⋮ 메뉴 → **홈 화면에 추가** 또는 **앱 설치**를 누르면, 각 앱의 공유 메뉴에 **핫플비서**가 나타납니다.
3. 처음 한 번은 **가져오기** 메뉴로 기존 저장 목록을 모읍니다. 그다음부터는 공유하거나 붙여넣기로 저장합니다.

## 내 PC에서 실행하기
```bash
cp .env.example .env.local   # 값 채우기
npm install
npm run dev                  # http://localhost:3000
```

## 알아둘 점
- **인스타그램 링크**: 서버가 본문을 가져오지 못하는 경우가 있습니다(비공개·삭제 게시물, 서버 차단 등). 이런 항목은 '취향 더하기' 목록에 '확인 필요'로 표시되니 캡션을 붙여넣거나 스크린샷을 추가하면 됩니다. 처음부터 스크린샷으로 공유하는 것이 가장 확실합니다.
- **카카오맵·네이버지도 저장 목록**: 내보내기 기능이 없어서 저장 목록 화면 스크린샷으로 가져옵니다.
- **추천의 지역 판단**: 지역명 기준이라 정밀한 거리 계산은 하지 않습니다. 지도 바로가기는 각 지도 앱의 검색으로 연결됩니다.
- **날씨**: [Open-Meteo](https://open-meteo.com) 예보(키 불필요, 비상업적 사용 무료)를 씁니다. 오늘부터 16일 뒤까지만 예보가 있고, 지역을 비워 두면 서울 기준입니다.
- **비용 (Sonnet 5.5 기준, 대략)**: 게시물 1건 분석 약 $0.01~0.02, 장소 1곳 설명 보강(웹 검색 포함) 약 $0.02~0.04, 추천 1회 약 $0.05~0.1. 모델을 바꾸려면 `CLAUDE_MODEL` 환경변수를 설정하세요.
- **웹 검색**: 설명 보강과 행사 기간 확인에 Claude 웹 검색을 씁니다(검색 1회 약 $0.01). Anthropic 콘솔에서 웹 검색이 꺼져 있으면 원본 게시물만으로 설명을 정리합니다.
- **댓글**: 인스타그램·유튜브 링크로는 댓글을 읽을 수 없어서, 댓글 반응은 스크린샷이나 붙여넣은 글에 있을 때 반영되고 그 외에는 웹 후기로 보완합니다.

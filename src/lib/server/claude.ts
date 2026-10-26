import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, GOOD_FOR, KINDS, type ImageInput } from "@/lib/types";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

// Server-side refusal fallback ("default" picks the model by refusal category). Only these models accept it.
const FALLBACK_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"];
const fallbackParams = FALLBACK_MODELS.includes(MODEL)
  ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
  : {};

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export function todayInSeoul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });

async function callJson<T>(opts: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
}): Promise<T> {
  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    output_config: { effort: opts.effort, format: { type: "json_schema", schema: opts.schema } },
    messages: [{ role: "user", content: opts.content }],
    ...fallbackParams,
  });
  if (res.stop_reason === "refusal") throw new Error("AI가 이 내용의 처리를 거절했습니다.");
  if (res.stop_reason === "max_tokens") throw new Error("AI 응답이 너무 길어 잘렸습니다. 내용을 나눠서 다시 시도해 주세요.");
  const text = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as T;
}

/** House style for place descriptions, shared by extraction and enrichment. */
const SUMMARY_RULE = `2~4줄(줄마다 줄바꿈)로 쓴다. 각 줄은 서로 다른 관점을 담고, 근거가 있는 것만 쓴다:
  ① 어떤 곳인지와 게시물이 특히 강조·어필하는 포인트
  ② 대표 메뉴·볼거리·가격대
  ③ 분위기·공간 묘사(인테리어, 소음, 좌석, 뷰 등)
  ④ 댓글·후기에서 사람들이 반응한 점, 요즘 인기 있는 이유
  근거가 부족하면 2줄로 짧게 쓰고, 내용을 지어내지 않는다. 광고 문구는 사실 위주로 옮긴다.`;

// ---------- 장소 추출 ----------

export interface ExtractedPlace {
  name: string;
  category: string;
  area: string;
  address: string | null;
  kind: (typeof KINDS)[number];
  start_date: string | null;
  end_date: string | null;
  /** Schedule details for events: opening hours, sessions, reservations. */
  period_note: string | null;
  hours: string | null;
  price: string | null;
  tags: string[];
  good_for: string[];
  summary: string;
}

export interface Extraction {
  status: "places" | "no_place" | "needs_input";
  note: string;
  places: ExtractedPlace[];
}

const PLACE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    category: { type: "string", enum: [...CATEGORIES] },
    area: { type: "string" },
    address: nullable({ type: "string" }),
    kind: { type: "string", enum: [...KINDS] },
    start_date: nullable({ type: "string", format: "date" }),
    end_date: nullable({ type: "string", format: "date" }),
    period_note: nullable({ type: "string" }),
    hours: nullable({ type: "string" }),
    price: nullable({ type: "string" }),
    tags: { type: "array", items: { type: "string" } },
    good_for: { type: "array", items: { type: "string", enum: [...GOOD_FOR] } },
    summary: { type: "string" },
  },
  required: [
    "name", "category", "area", "address", "kind", "start_date", "end_date",
    "period_note", "hours", "price", "tags", "good_for", "summary",
  ],
};

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["places", "no_place", "needs_input"] },
    note: { type: "string" },
    places: { type: "array", items: PLACE_SCHEMA },
  },
  required: ["status", "note", "places"],
};

const EXTRACTION_SYSTEM = `너는 사용자가 SNS·지도 앱에서 저장한 콘텐츠에서 "가보고 싶은 장소"를 뽑아 정리하는 비서다.
입력은 공유된 텍스트, 링크에서 가져온 내용, 스크린샷, 파일 내용 중 일부다.

규칙:
- 오프라인으로 직접 방문할 수 있는 장소는 종류를 가리지 않고 모두 뽑는다: 음식점, 카페, 베이커리, 술집, 상점·편집숍·쇼룸, 팝업스토어, 전시·공연장, 관광지·명소·랜드마크, 체험공간·공방·클래스, 공원·자연·산책로, 레저·액티비티 시설, 숙소 등.
- 한 콘텐츠에 여러 곳이 있으면 모두 뽑는다. 온라인 쇼핑몰·앱·제품 자체처럼 방문할 수 없는 대상은 제외한다.
- category는 목록에서 가장 가까운 것을 고르고, 애매하면 "기타"로 한다.
- 콘텐츠에 없는 정보는 지어내지 않는다. 모르는 값은 null로 둔다. 주소는 콘텐츠에 있거나 널리 알려진 경우에만 쓴다.
- area는 "서울 성동구 성수동"처럼 시/구/동 수준으로, 아는 만큼만 쓴다(예: "서울 성수동", "부산 해운대").
- kind는 상시 운영하는 곳이면 "상설", 기간이 정해진 일시적인 행사면 그 종류("팝업", "전시", "공연", "페스티벌", "행사")로 한다. 같은 공간에서 열리는 기간 한정 전시·팝업은 공간이 아니라 행사 자체를 하나의 항목으로 본다.
- 행사의 name은 행사 고유 이름(예: "무신사 스탠다드 2026 F/W 팝업스토어")으로 쓰고, 열리는 장소는 address/area에 쓴다.
- 행사는 기간이 핵심 정보다. start_date/end_date를 YYYY-MM-DD로 쓰고, 연도가 없으면 오늘 날짜 기준으로 가장 그럴듯한 연도를 쓴다. 운영 시간·회차·사전예약 같은 일정 정보는 period_note에 쓴다. 상설 장소는 period_note를 null로 둔다.
- tags는 분위기·특징 3~8개(예: "조용한", "뷰맛집", "루프탑", "대형카페", "웨이팅", "예약필수", "주차가능", "노키즈존").
- good_for는 어울리는 약속 목적·동행을 고른다.
- summary는 ${SUMMARY_RULE}
- 장소와 무관한 콘텐츠면 status "no_place".
- 링크만 있고 내용이 비어 있거나 장소를 특정할 수 없으면 status "needs_input"으로 하고 note에 무엇이 더 필요한지 쓴다.
- note는 한국어 한 문장으로 처리 결과를 요약한다.`;

export async function extractPlaces(text: string, images: ImageInput[] = []): Promise<Extraction> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.media_type, data: img.data },
  }));
  content.push({
    type: "text",
    text: `오늘 날짜: ${todayInSeoul()}\n\n${text || "(텍스트 없음 — 이미지만 있음)"}`,
  });
  return callJson<Extraction>({
    system: EXTRACTION_SYSTEM,
    content,
    schema: EXTRACTION_SCHEMA,
    effort: "medium",
    maxTokens: 16000,
  });
}

// ---------- 약속 장소 추천 ----------

export interface RecommendationRaw {
  summary: string;
  course: string | null;
  picks: { id: string; reason: string; tip: string }[];
}

const RECOMMEND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    course: nullable({ type: "string" }),
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          reason: { type: "string" },
          tip: { type: "string" },
        },
        required: ["id", "reason", "tip"],
      },
    },
  },
  required: ["summary", "course", "picks"],
};

const RECOMMEND_SYSTEM = `너는 사용자가 평소 저장해 둔 "가보고 싶은 장소" 목록에서 약속 장소를 골라 주는 비서다.
반드시 후보 목록에 있는 장소만 id로 추천한다. 목록에 없는 장소는 절대 만들지 않는다.
약속 정보 중 "미정"인 항목은 제약이 없다는 뜻이다. 입력된 항목만으로 판단하고, 미정 항목은 다양한 선택지를 섞어 추천한다.

판단 기준(중요한 순서):
1. 지역: 지역이 정해졌으면 같은 동네이거나 대중교통으로 가까운 곳만. 지역이 많이 다르면 제외한다.
2. 날짜·시간: 팝업 기간, 휴무일·영업시간이 알려져 있으면 맞는 곳만. 정보가 없으면 후보로 두되 tip에 "방문 전 영업시간 확인"을 쓴다.
3. 날씨: 날씨 정보가 있으면 반영한다. 비·눈·폭염·한파·강풍이면 실내 장소를 우선하고, 맑고 선선하면 야외·테라스·산책·뷰 장소에 가산한다. 날씨를 반영했다면 reason이나 summary에 짧게 언급한다.
4. 목적·동행인과의 궁합: 분위기, 소음, 좌석, 아이·반려동물 동반 가능 여부 등.
5. 사용자의 관심도: 여러 번 저장한 곳(저장 횟수), 곧 끝나는 팝업은 우선한다.

출력:
- picks는 요청한 개수 이내로, 좋은 순서대로. 조건에 맞는 곳이 적으면 적게 추천해도 된다.
- reason은 이 약속에 왜 맞는지 1~2문장, tip은 실용 팁 한 문장(예약, 웨이팅, 추천 메뉴, 확인할 점).
- course는 코스를 요청했을 때만 "식사(A) → 카페(B) → 산책(C)"처럼 동선을 쓰고, 아니면 null.
- summary는 추천 전체를 한 문장으로 요약한다. 마땅한 후보가 없으면 그 이유와 어떤 장소를 저장해 두면 좋을지 쓴다.`;

// ---------- 지역명 → 좌표 (날씨 조회용) ----------

const LOCATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    found: { type: "boolean" },
    label: { type: "string" },
    latitude: { type: "number" },
    longitude: { type: "number" },
  },
  required: ["found", "label", "latitude", "longitude"],
};

/** Resolves a Korean area name ("성수역", "부산 해운대") to approximate coordinates. */
export async function locateArea(area: string) {
  const res = await callJson<{ found: boolean; label: string; latitude: number; longitude: number }>({
    system:
      "한국(또는 해외) 지명·역·동네 이름을 받아 대략적인 중심 좌표를 알려준다. label은 '서울 성동구 성수동'처럼 짧은 한국어 지명. 어디인지 알 수 없으면 found를 false로 한다.",
    content: [{ type: "text", text: area }],
    schema: LOCATION_SCHEMA,
    effort: "low",
    maxTokens: 2000,
  });
  return res.found ? res : null;
}

export async function recommendPlaces(request: string, candidates: string): Promise<RecommendationRaw> {
  return callJson<RecommendationRaw>({
    system: RECOMMEND_SYSTEM,
    content: [{ type: "text", text: `[약속 정보]\n${request}\n\n[후보 장소 목록]\n${candidates}` }],
    schema: RECOMMEND_SCHEMA,
    effort: "high",
    maxTokens: 16000,
  });
}

// ---------- 중복 판정 ----------

export interface DedupeCandidate {
  key: string;
  name: string;
  category: string | null;
  kind: string;
  area: string | null;
  address: string | null;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
}

const DEDUPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { keys: { type: "array", items: { type: "string" } } },
        required: ["keys"],
      },
    },
  },
  required: ["groups"],
};

const DEDUPE_SYSTEM = `너는 사용자의 "가보고 싶은 장소" 목록에서 같은 대상을 가리키는 항목을 찾아 묶는다.
입력은 여러 "후보 묶음"이다. 각 묶음 안에서만 비교하고, 서로 다른 묶음의 항목은 절대 합치지 않는다.

같은 대상으로 보는 경우:
- 상설 장소: 같은 실제 매장·공간이면 같다. 띄어쓰기, 지점 표기("성수점"), 괄호, 영문/한글 표기, 업종 접두어("카페 ○○") 차이는 무시한다.

같은 대상이 아닌 경우:
- 같은 브랜드라도 지점(지역)이 다르면 다르다.
- 같은 건물·주소라도 다른 매장이면 다르다.
- 기간 한정 행사(팝업·전시·공연·페스티벌·행사)는 행사 내용(이름·주최·테마)과 기간이 모두 같아야 같다. 같은 장소에서 열리는 다른 행사, 같은 행사의 다른 회차·시즌(기간이 다름)은 다르다. 기간 정보가 한쪽에만 있거나 둘 다 없으면 이름과 설명이 사실상 같을 때만 같다고 본다.
- 상설 매장과 그 브랜드의 팝업스토어는 다르다.

출력: 같은 대상끼리 묶은 그룹 목록. 각 그룹은 key 2개 이상이다. 확신이 없으면 묶지 않는다. 묶을 것이 없으면 빈 배열을 낸다.`;

function describeCandidate(c: DedupeCandidate) {
  const period = c.kind !== "상설" ? `기간 ${c.start_date ?? "?"}~${c.end_date ?? "?"}` : null;
  return [c.key, c.kind, c.category, c.name, c.area, c.address, period, c.summary?.slice(0, 80)].filter(Boolean).join(" | ");
}

/** Splits each candidate batch into groups of entries that are the same place or event. */
export async function judgeDuplicates(batches: DedupeCandidate[][]): Promise<string[][]> {
  const text = batches.map((b, i) => `## 묶음 ${i + 1}\n${b.map(describeCandidate).join("\n")}`).join("\n\n");
  const res = await callJson<{ groups: { keys: string[] }[] }>({
    system: DEDUPE_SYSTEM,
    content: [{ type: "text", text }],
    schema: DEDUPE_SCHEMA,
    effort: "medium",
    maxTokens: 8000,
  });
  return res.groups.map((g) => g.keys);
}

// ---------- 장소 보강: 웹 조사 + 설명 재작성 + 행사 기간 확인 ----------

export interface PlaceRefresh {
  summary: string;
  tags: string[];
  hours: string | null;
  price: string | null;
  address: string | null;
  period: {
    found: boolean;
    start_date: string | null;
    end_date: string | null;
    schedule: string | null;
    source_url: string | null;
  };
  /** false when the web search could not run (e.g. disabled for the organization). */
  searched: boolean;
}

const REFRESH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    hours: nullable({ type: "string" }),
    price: nullable({ type: "string" }),
    address: nullable({ type: "string" }),
    period: {
      type: "object",
      additionalProperties: false,
      properties: {
        found: { type: "boolean" },
        start_date: nullable({ type: "string", format: "date" }),
        end_date: nullable({ type: "string", format: "date" }),
        schedule: nullable({ type: "string" }),
        source_url: nullable({ type: "string" }),
      },
      required: ["found", "start_date", "end_date", "schedule", "source_url"],
    },
  },
  required: ["summary", "tags", "hours", "price", "address", "period"],
};

interface RefreshTarget {
  name: string;
  kind: string;
  category: string | null;
  area: string | null;
  address: string | null;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
  tags: string[];
}

/** Web research on the place: recent buzz, reviews, menu, mood; for events, the running period. */
async function research(t: RefreshTarget, today: string) {
  const isEvent = t.kind !== "상설";
  const where = [t.area, t.address].filter(Boolean).join(", ") || "지역 미상";
  const userLocation = { type: "approximate" as const, country: "KR", timezone: "Asia/Seoul" };
  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: `오늘 날짜는 ${today}이다. 너는 한국의 장소·행사 정보를 웹에서 조사하는 조사원이다. 공식 계정·주최측·예매처·언론 기사·최근 방문 후기를 우선하고, 이름이 같은 다른 곳과 헷갈리지 않게 지역·주소로 확인한 사실만 짧게 정리한다.`,
    // Haiku only has the basic search tool; Sonnet/Opus get the version with dynamic result filtering.
    tools: [
      MODEL.includes("haiku")
        ? { type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: userLocation }
        : { type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: userLocation },
    ],
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: `다음 ${isEvent ? t.kind : "장소"}에 대해 조사해 줘.
이름: ${t.name} (${t.category ?? "종류 미상"})
위치: ${where}
${isEvent ? `저장된 기간: ${t.start_date ?? "?"} ~ ${t.end_date ?? "?"}\n` : ""}
알고 싶은 것:
- 요즘 인기 있는 이유, 화제가 된 포인트
- 후기·댓글에서 자주 언급되는 반응(좋은 점, 아쉬운 점, 웨이팅 등)
- 대표 메뉴·볼거리와 가격대
- 분위기·공간의 특징
${isEvent ? "- 실제 운영 기간(시작일·종료일), 운영 시간, 예약 방법" : "- 영업시간, 휴무일"}
찾은 사실과 근거 URL을 정리하고, 이 곳임을 확인하지 못했으면 그렇다고 말해 줘.`,
      },
    ],
    ...fallbackParams,
  });
  if (res.stop_reason === "refusal") throw new Error("AI가 조사를 거절했습니다.");

  const findings: string[] = [];
  const urls = new Set<string>();
  for (const block of res.content) {
    if (block.type === "text") {
      findings.push(block.text);
      for (const c of block.citations ?? []) if (c.type === "web_search_result_location") urls.add(c.url);
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content.slice(0, 3)) urls.add(r.url);
    }
  }
  return { findings: findings.join("\n"), urls: [...urls] };
}

/**
 * Rewrites a place's description from its source posts plus web research,
 * and for events confirms the running period. Falls back to sources only if search fails.
 */
export async function refreshPlaceInfo(t: RefreshTarget, sourceText: string): Promise<PlaceRefresh> {
  const today = todayInSeoul();
  let web: { findings: string; urls: string[] } | null = null;
  try {
    web = await research(t, today);
  } catch {
    web = null;
  }

  const isEvent = t.kind !== "상설";
  const result = await callJson<Omit<PlaceRefresh, "searched">>({
    system: `너는 사용자의 "가보고 싶은 장소" 카드를 정리한다. 저장된 정보, 원본 게시물 내용, 웹 조사 결과를 종합한다.
- summary는 ${SUMMARY_RULE}
- 원본 게시물이 강조한 포인트를 먼저 살리고, 웹 조사 결과로 요즘 인기 이유·후기 반응을 보탠다.
- tags는 분위기·특징 3~8개. hours·price·address는 확인된 경우에만 쓰고 아니면 null.
- period: ${isEvent ? `행사의 실제 운영 기간. 조사 결과가 바로 그 행사(이름·장소 일치)를 가리키고 날짜가 명시된 경우에만 found=true. 날짜는 YYYY-MM-DD(오늘 ${today}). schedule은 운영 시간·휴무·예약을 한 줄로, source_url은 기간 근거 URL 하나.` : "상설 장소이므로 found=false, 나머지는 null."}`,
    content: [
      {
        type: "text",
        text: `[저장된 정보]
${t.kind} / ${t.category ?? ""} / ${t.name} / ${[t.area, t.address].filter(Boolean).join(", ")}
기간: ${t.start_date ?? "?"} ~ ${t.end_date ?? "?"}
태그: ${t.tags.join(", ")}
설명: ${t.summary ?? "(없음)"}

[원본 게시물 내용]
${sourceText || "(없음)"}

[웹 조사 결과]
${web ? `${web.findings || "(결과 없음)"}\n근거 URL 후보:\n${web.urls.join("\n") || "(없음)"}` : "(웹 검색을 사용할 수 없음)"}`,
      },
    ],
    schema: REFRESH_SCHEMA,
    effort: "medium",
    maxTokens: 6000,
  });
  return { ...result, searched: web !== null };
}

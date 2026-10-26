import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, GOOD_FOR, type ImageInput } from "@/lib/types";

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

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
  content: Anthropic.ContentBlockParam[];
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
}): Promise<T> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    output_config: { effort: opts.effort, format: { type: "json_schema", schema: opts.schema } },
    messages: [{ role: "user", content: opts.content }],
  });
  if (res.stop_reason === "refusal") throw new Error("AI가 이 내용의 처리를 거절했습니다.");
  if (res.stop_reason === "max_tokens") throw new Error("AI 응답이 너무 길어 잘렸습니다. 내용을 나눠서 다시 시도해 주세요.");
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as T;
}

// ---------- 장소 추출 ----------

export interface ExtractedPlace {
  name: string;
  category: string;
  area: string;
  address: string | null;
  kind: "상설" | "팝업" | "이벤트";
  start_date: string | null;
  end_date: string | null;
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
    kind: { type: "string", enum: ["상설", "팝업", "이벤트"] },
    start_date: nullable({ type: "string", format: "date" }),
    end_date: nullable({ type: "string", format: "date" }),
    hours: nullable({ type: "string" }),
    price: nullable({ type: "string" }),
    tags: { type: "array", items: { type: "string" } },
    good_for: { type: "array", items: { type: "string", enum: [...GOOD_FOR] } },
    summary: { type: "string" },
  },
  required: [
    "name", "category", "area", "address", "kind", "start_date", "end_date",
    "hours", "price", "tags", "good_for", "summary",
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
- 실제로 방문할 수 있는 장소(카페, 음식점, 술집, 팝업스토어, 전시, 체험, 쇼핑, 공원 등)만 뽑는다. 한 콘텐츠에 여러 곳이 있으면 모두 뽑는다.
- 콘텐츠에 없는 정보는 지어내지 않는다. 모르는 값은 null로 둔다. 주소는 콘텐츠에 있거나 널리 알려진 경우에만 쓴다.
- area는 "서울 성동구 성수동"처럼 시/구/동 수준으로, 아는 만큼만 쓴다(예: "서울 성수동", "부산 해운대").
- 팝업·전시 등 기간이 있으면 kind를 "팝업" 또는 "이벤트"로 하고 start_date/end_date를 YYYY-MM-DD로 쓴다. 연도가 없으면 오늘 날짜 기준으로 가장 그럴듯한 연도를 쓴다.
- tags는 분위기·특징 3~8개(예: "조용한", "뷰맛집", "루프탑", "대형카페", "웨이팅", "예약필수", "주차가능", "노키즈존").
- good_for는 어울리는 약속 목적·동행을 고른다.
- summary는 어떤 곳인지와 대표 메뉴·볼거리를 1~2문장으로 쓴다.
- 장소와 무관한 콘텐츠면 status "no_place".
- 링크만 있고 내용이 비어 있거나 장소를 특정할 수 없으면 status "needs_input"으로 하고 note에 무엇이 더 필요한지 쓴다.
- note는 한국어 한 문장으로 처리 결과를 요약한다.`;

export async function extractPlaces(text: string, images: ImageInput[] = []): Promise<Extraction> {
  const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
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

판단 기준(중요한 순서):
1. 지역: 약속 지역과 같은 동네이거나 대중교통으로 가까운 곳. 지역이 많이 다르면 제외한다.
2. 날짜·시간: 팝업 기간, 휴무일·영업시간이 알려져 있으면 맞는 곳만. 정보가 없으면 후보로 두되 tip에 "방문 전 영업시간 확인"을 쓴다.
3. 목적·동행인과의 궁합: 분위기, 소음, 좌석, 아이·반려동물 동반 가능 여부 등.
4. 사용자의 관심도: 여러 번 저장한 곳(저장 횟수), 곧 끝나는 팝업은 우선한다.

출력:
- picks는 요청한 개수 이내로, 좋은 순서대로. 조건에 맞는 곳이 적으면 적게 추천해도 된다.
- reason은 이 약속에 왜 맞는지 1~2문장, tip은 실용 팁 한 문장(예약, 웨이팅, 추천 메뉴, 확인할 점).
- course는 코스를 요청했을 때만 "식사(A) → 카페(B) → 산책(C)"처럼 동선을 쓰고, 아니면 null.
- summary는 추천 전체를 한 문장으로 요약한다. 마땅한 후보가 없으면 그 이유와 어떤 장소를 저장해 두면 좋을지 쓴다.`;

export async function recommendPlaces(request: string, candidates: string): Promise<RecommendationRaw> {
  return callJson<RecommendationRaw>({
    system: RECOMMEND_SYSTEM,
    content: [{ type: "text", text: `[약속 정보]\n${request}\n\n[후보 장소 목록]\n${candidates}` }],
    schema: RECOMMEND_SCHEMA,
    effort: "high",
    maxTokens: 16000,
  });
}

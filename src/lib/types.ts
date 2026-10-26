export type ItemStatus = "pending" | "done" | "no_place" | "needs_input" | "error";
export type PlaceStatus = "want" | "visited" | "skip";

export interface Item {
  id: string;
  user_id: string;
  source: string;
  url: string | null;
  shared_text: string | null;
  extra_text: string | null;
  status: ItemStatus;
  note: string | null;
  place_count: number;
  created_at: string;
}

export interface Place {
  id: string;
  user_id: string;
  item_id: string | null;
  name: string;
  category: string | null;
  area: string | null;
  address: string | null;
  kind: string;
  start_date: string | null;
  end_date: string | null;
  hours: string | null;
  price: string | null;
  tags: string[];
  good_for: string[];
  summary: string | null;
  source_url: string | null;
  save_count: number;
  status: PlaceStatus;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

/** base64 image payload sent from the browser (already resized). */
export interface ImageInput {
  data: string;
  media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

/** Every field is optional; the recommender fills gaps with sensible defaults. */
export interface RecommendInput {
  area?: string;
  date?: string;
  time?: string;
  purpose?: string;
  companions?: string;
  extra?: string;
  includeVisited?: boolean;
  count?: number;
}

export interface RecommendPick {
  place: Place;
  reason: string;
  tip: string;
}

export interface WeatherSummary {
  date: string;
  location: string;
  /** WMO weather code for the day */
  code: number;
  label: string;
  tempMin: number;
  tempMax: number;
  precipProbability: number | null;
}

export interface RecommendResult {
  summary: string;
  course: string | null;
  picks: RecommendPick[];
  weather: WeatherSummary | null;
  /** Why weather is missing, e.g. the date is beyond the 16-day forecast window. */
  weatherNote?: string;
}

/** Anything people can visit in person. "기타" catches the rest. */
export const CATEGORIES = [
  "카페",
  "베이커리/디저트",
  "음식점",
  "술집/바",
  "팝업스토어",
  "쇼핑/스토어",
  "전시/공연",
  "체험/클래스",
  "관광지/명소",
  "자연/공원",
  "액티비티/레저",
  "숙소",
  "기타",
] as const;

export const GOOD_FOR = [
  "데이트",
  "기념일",
  "소개팅",
  "친구",
  "단체모임",
  "가족",
  "부모님",
  "아이동반",
  "반려동물",
  "혼자",
  "업무미팅",
] as const;

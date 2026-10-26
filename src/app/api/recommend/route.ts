import { authenticate, jsonError } from "@/lib/server/auth";
import { recommendPlaces, todayInSeoul } from "@/lib/server/claude";
import type { Place, RecommendInput, RecommendResult } from "@/lib/types";

export const maxDuration = 300;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function describe(p: Place, id: string) {
  const fields = [
    id,
    p.category,
    p.name,
    p.area || p.address || "지역 미상",
    p.kind !== "상설" ? `${p.kind} ${p.start_date ?? "?"}~${p.end_date ?? "?"}` : null,
    p.hours && `영업 ${p.hours}`,
    p.price && `가격 ${p.price}`,
    p.tags.length ? `특징 ${p.tags.join(",")}` : null,
    p.good_for.length ? `어울림 ${p.good_for.join(",")}` : null,
    p.save_count > 1 ? `저장 ${p.save_count}회` : null,
    p.status === "visited" ? "다녀온 곳" : null,
    p.memo && `메모 ${p.memo}`,
    p.summary,
  ];
  return fields.filter(Boolean).join(" | ");
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return jsonError("로그인이 필요합니다.", 401);

  const input = (await request.json()) as RecommendInput;
  if (!input.area?.trim()) return jsonError("약속 지역을 입력해 주세요.", 400);
  const date = input.date || todayInSeoul();

  const { data, error } = await auth.supabase
    .from("places")
    .select("*")
    .in("status", input.includeVisited ? ["want", "visited"] : ["want"])
    .order("updated_at", { ascending: false })
    .limit(400);
  if (error) return jsonError(error.message, 500);

  // Drop pop-ups and events that are not running on the appointment date.
  const places = (data as Place[]).filter(
    (p) => !(p.end_date && p.end_date < date) && !(p.start_date && p.start_date > date),
  );
  if (!places.length) {
    return Response.json({
      summary: "그 날짜에 추천할 수 있는 저장 장소가 없어요. 먼저 장소를 저장하거나 가져와 주세요.",
      course: null,
      picks: [],
    } satisfies RecommendResult);
  }

  const ids = new Map(places.map((p, i) => [`p${i + 1}`, p]));
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00+09:00`).getUTCDay()];
  const requestText = [
    `지역: ${input.area}`,
    `날짜: ${date} (${weekday}요일)`,
    `시간: ${input.time || "미정"}`,
    `목적: ${input.purpose || "미정"}`,
    `동행인: ${input.companions || "미정"}`,
    input.extra && `기타 조건: ${input.extra}`,
    `추천 개수: 최대 ${input.count ?? 5}곳`,
  ]
    .filter(Boolean)
    .join("\n");
  const candidates = [...ids].map(([id, p]) => describe(p, id)).join("\n");

  try {
    const raw = await recommendPlaces(requestText, candidates);
    const result: RecommendResult = {
      summary: raw.summary,
      course: raw.course,
      picks: raw.picks
        .filter((pick) => ids.has(pick.id))
        .map((pick) => ({ place: ids.get(pick.id)!, reason: pick.reason, tip: pick.tip })),
    };
    // The AI writes course steps with candidate ids; show place names instead.
    if (result.course) result.course = result.course.replace(/\bp\d+\b/g, (id) => ids.get(id)?.name ?? id);
    return Response.json(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "추천 중 오류가 발생했습니다.", 500);
  }
}
